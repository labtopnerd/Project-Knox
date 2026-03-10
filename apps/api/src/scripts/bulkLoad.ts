/**
 * LegiScan Bulk Dataset Loader
 *
 * Performs a full historical load of all bills, representatives, and roll calls
 * from LegiScan weekly dataset ZIPs — bypassing per-bill API calls entirely.
 *
 * Two modes:
 *   1. API mode:   Downloads ZIPs via getDatasetList + getDataset (requires Bulk API subscription)
 *   2. Local mode: Processes manually downloaded ZIPs from a local directory
 *
 * Usage:
 *   tsx src/scripts/bulkLoad.ts                     # API mode, US Congress 119 only
 *   tsx src/scripts/bulkLoad.ts --state US          # API mode, specific state
 *   tsx src/scripts/bulkLoad.ts --all               # API mode, all available sessions
 *   tsx src/scripts/bulkLoad.ts --dir /path/to/zips # Local mode
 *
 * Local ZIP download: https://legiscan.com/datasets
 */

import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import AdmZip from 'adm-zip'
import { prisma } from '../lib/prisma'
import { getDatasetList, getDataset } from '../services/legiscan/client'
import {
  transformLegiScanBill,
  transformLegiScanPerson,
  parseStateFromDistrict,
  parseDistrictNumber,
} from '../services/legiscan/transformers'
import { syncRollCallsForBill } from '../services/legiscan/syncUtils'
import type { LegiScanBillDetail, LegiScanPerson, LegiScanRollCall } from '../services/legiscan/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface BulkStats {
  bills: { upserted: number; skipped: number; errors: number }
  people: { upserted: number; errors: number }
  rollCalls: { upserted: number; errors: number }
}

// ─── ZIP Processor ────────────────────────────────────────────────────────────

async function processZipBuffer(zipBuffer: Buffer, label: string): Promise<BulkStats> {
  const stats: BulkStats = {
    bills: { upserted: 0, skipped: 0, errors: 0 },
    people: { upserted: 0, errors: 0 },
    rollCalls: { upserted: 0, errors: 0 },
  }

  let zip: AdmZip
  try {
    zip = new AdmZip(zipBuffer)
  } catch (err) {
    console.error(`[BulkLoad] Failed to open ZIP for ${label}:`, err)
    return stats
  }

  const entries = zip.getEntries()
  console.log(`[BulkLoad] ${label}: processing ${entries.length} files`)

  // First pass: upsert all people so sponsor FK references resolve
  const peopleEntries = entries.filter((e) => e.entryName.includes('/people/') && e.entryName.endsWith('.json'))
  for (const entry of peopleEntries) {
    try {
      const raw = JSON.parse(entry.getData().toString('utf8')) as { person?: LegiScanPerson }
      const person = raw.person
      if (!person?.people_id) continue

      const data = transformLegiScanPerson(person)
      await prisma.representative.upsert({
        where: { externalId: data.externalId },
        create: data,
        update: {
          fullName: data.fullName,
          party: data.party,
          stateCode: data.stateCode,
          district: data.district,
          title: data.title,
        },
      })
      stats.people.upserted++
    } catch {
      stats.people.errors++
    }
  }

  if (peopleEntries.length > 0) {
    console.log(`[BulkLoad] ${label}: ${stats.people.upserted} people upserted`)
  }

  // Second pass: upsert bills (includes sponsor and cosponsor links)
  const billEntries = entries.filter((e) => e.entryName.includes('/bill/') && e.entryName.endsWith('.json'))
  let billsDone = 0

  for (const entry of billEntries) {
    try {
      const raw = JSON.parse(entry.getData().toString('utf8')) as { bill?: LegiScanBillDetail }
      const bill = raw.bill
      if (!bill?.bill_id) {
        stats.bills.skipped++
        continue
      }

      // Determine congress number from session year
      const yearStart = bill.session?.year_start ?? 2025
      const congress = 119 - Math.floor((2025 - yearStart) / 2)

      const result = transformLegiScanBill(bill, congress)
      if (!result) {
        stats.bills.skipped++
        continue
      }

      const { primarySponsorPeopleId, cosponsorPeopleIds, ...billData } = result

      // Resolve sponsor
      let sponsorId: string | undefined
      if (primarySponsorPeopleId != null) {
        const sponsor = bill.sponsors.find((s) => s.people_id === primarySponsorPeopleId)
        if (sponsor) {
          const sponsorStateCode = sponsor.district ? parseStateFromDistrict(sponsor.district) || null : null
          const sponsorDistrict = sponsor.district ? parseDistrictNumber(sponsor.district) : null
          const rep = await prisma.representative.upsert({
            where: { externalId: `legiscan:${primarySponsorPeopleId}` },
            create: {
              externalId: `legiscan:${primarySponsorPeopleId}`,
              source: 'congress',
              fullName: sponsor.name,
              party: sponsor.party ?? null,
              chamber: billData.chamber ?? 'house',
              level: 'federal',
              stateCode: sponsorStateCode,
              district: sponsorDistrict,
              isActive: true,
              lastSyncedAt: new Date(),
            },
            update: {
              fullName: sponsor.name,
              party: sponsor.party ?? null,
              stateCode: sponsorStateCode,
              district: sponsorDistrict,
            },
            select: { id: true },
          })
          sponsorId = rep.id
        }
      }

      // Upsert bill
      await prisma.bill.upsert({
        where: { externalId: billData.externalId },
        create: {
          ...billData,
          ...(sponsorId ? { sponsor: { connect: { id: sponsorId } } } : {}),
        },
        update: {
          title: billData.title,
          status: billData.status,
          lastActionDate: billData.lastActionDate,
          lastActionText: billData.lastActionText,
          fullTextUrl: billData.fullTextUrl,
          actions: billData.actions,
          summary: billData.summary ?? undefined,
          rawData: billData.rawData,
          ...(sponsorId ? { sponsor: { connect: { id: sponsorId } } } : {}),
          lastSyncedAt: new Date(),
        },
      })

      // Upsert cosponsor links
      for (const cosponsorPeopleId of cosponsorPeopleIds) {
        const cosponsorRep = await prisma.representative.findUnique({
          where: { externalId: `legiscan:${cosponsorPeopleId}` },
          select: { id: true },
        })
        if (cosponsorRep) {
          const dbBill = await prisma.bill.findUnique({
            where: { externalId: billData.externalId },
            select: { id: true },
          })
          if (dbBill) {
            await prisma.billCosponsor.upsert({
              where: { billId_representativeId: { billId: dbBill.id, representativeId: cosponsorRep.id } },
              create: { billId: dbBill.id, representativeId: cosponsorRep.id, joinedAt: null },
              update: {},
            })
          }
        }
      }

      stats.bills.upserted++
    } catch (err) {
      console.error(`[BulkLoad] Error processing bill entry ${entry.entryName}:`, err)
      stats.bills.errors++
    }

    billsDone++
    if (billsDone % 500 === 0) {
      console.log(`[BulkLoad] ${label}: ${billsDone}/${billEntries.length} bills processed…`)
    }
  }

  // Third pass: roll call votes
  const voteEntries = entries.filter((e) => e.entryName.includes('/vote/') && e.entryName.endsWith('.json'))

  for (const entry of voteEntries) {
    try {
      const raw = JSON.parse(entry.getData().toString('utf8')) as { roll_call?: LegiScanRollCall }
      const rollCall = raw.roll_call
      if (!rollCall?.roll_call_id) continue

      // Find the DB bill for this roll call via rawData bill_id
      const dbBill = await prisma.bill.findFirst({
        where: { rawData: { path: ['bill_id'], equals: rollCall.bill_id }, level: 'federal' },
        select: { id: true },
      })
      if (!dbBill) continue

      const chamber = rollCall.chamber === 'H' ? 'house' : 'senate'

      const dbRollCall = await prisma.rollCall.upsert({
        where: { rollCallId: rollCall.roll_call_id },
        create: {
          rollCallId: rollCall.roll_call_id,
          billId: dbBill.id,
          date: new Date(rollCall.date),
          description: rollCall.desc,
          yea: rollCall.yea,
          nay: rollCall.nay,
          nv: rollCall.nv,
          absent: rollCall.absent,
          total: rollCall.total,
          passed: rollCall.passed === 1,
          chamber,
        },
        update: {
          yea: rollCall.yea,
          nay: rollCall.nay,
          nv: rollCall.nv,
          absent: rollCall.absent,
          total: rollCall.total,
          passed: rollCall.passed === 1,
        },
      })

      for (const memberVote of rollCall.votes ?? []) {
        const rep = await prisma.representative.findUnique({
          where: { externalId: `legiscan:${memberVote.people_id}` },
          select: { id: true },
        })
        if (!rep) continue

        await prisma.repVote.upsert({
          where: { representativeId_rollCallId: { representativeId: rep.id, rollCallId: dbRollCall.id } },
          create: { rollCallId: dbRollCall.id, representativeId: rep.id, voteText: memberVote.vote_text },
          update: { voteText: memberVote.vote_text },
        })
      }

      stats.rollCalls.upserted++
    } catch {
      stats.rollCalls.errors++
    }
  }

  return stats
}

// ─── API Mode ─────────────────────────────────────────────────────────────────

async function loadViaApi(stateFilter?: string): Promise<void> {
  console.log('[BulkLoad] Fetching dataset list from LegiScan API…')
  const datasets = await getDatasetList(stateFilter)

  if (datasets.length === 0) {
    console.error('[BulkLoad] No datasets returned. Your API key may not have Bulk API access.')
    console.error('[BulkLoad] Upgrade at https://legiscan.com/legiscan or use --dir mode with manually downloaded ZIPs.')
    process.exit(1)
  }

  // When a state filter is set, getDatasetList already filtered — use datasets directly.
  // Without a filter, deduplicate to the most recent session per state_id.
  let targets: typeof datasets
  if (stateFilter) {
    targets = datasets
  } else {
    const latestByState = new Map<number, typeof datasets[0]>()
    for (const ds of datasets) {
      const existing = latestByState.get(ds.state_id)
      if (!existing || ds.year_start > existing.year_start) {
        latestByState.set(ds.state_id, ds)
      }
    }
    targets = [...latestByState.values()]
  }

  console.log(`[BulkLoad] Loading ${targets.length} dataset(s) via API`)

  let totalStats: BulkStats = {
    bills: { upserted: 0, skipped: 0, errors: 0 },
    people: { upserted: 0, errors: 0 },
    rollCalls: { upserted: 0, errors: 0 },
  }

  for (const ds of targets) {
    const label = ds.session_name
    console.log(`[BulkLoad] Downloading ${label} (${(ds.dataset_size / 1024 / 1024).toFixed(1)} MB)…`)

    const zipData = await getDataset(ds.session_id, ds.access_key)
    if (!zipData?.zip) {
      console.warn(`[BulkLoad] No ZIP data for ${label} — skipping`)
      continue
    }

    const zipBuffer = Buffer.from(zipData.zip, 'base64')
    const stats = await processZipBuffer(zipBuffer, label)

    totalStats.bills.upserted += stats.bills.upserted
    totalStats.bills.skipped += stats.bills.skipped
    totalStats.bills.errors += stats.bills.errors
    totalStats.people.upserted += stats.people.upserted
    totalStats.people.errors += stats.people.errors
    totalStats.rollCalls.upserted += stats.rollCalls.upserted
    totalStats.rollCalls.errors += stats.rollCalls.errors

    console.log(`[BulkLoad] ${label} done:`, JSON.stringify(stats))

    // Brief pause between dataset downloads to be polite to the API
    await sleep(1000)
  }

  console.log('[BulkLoad] === API bulk load complete ===')
  console.log('[BulkLoad] Total:', JSON.stringify(totalStats))
}

// ─── Local Mode ───────────────────────────────────────────────────────────────

async function loadFromDirectory(dir: string): Promise<void> {
  const absDir = path.resolve(dir)

  if (!fs.existsSync(absDir)) {
    console.error(`[BulkLoad] Directory not found: ${absDir}`)
    process.exit(1)
  }

  const zipFiles = fs.readdirSync(absDir).filter((f) => f.endsWith('.zip'))

  if (zipFiles.length === 0) {
    console.error(`[BulkLoad] No .zip files found in ${absDir}`)
    console.error('[BulkLoad] Download ZIPs from https://legiscan.com/datasets')
    process.exit(1)
  }

  console.log(`[BulkLoad] Found ${zipFiles.length} ZIP file(s) in ${absDir}`)

  let totalStats: BulkStats = {
    bills: { upserted: 0, skipped: 0, errors: 0 },
    people: { upserted: 0, errors: 0 },
    rollCalls: { upserted: 0, errors: 0 },
  }

  for (const filename of zipFiles) {
    const filePath = path.join(absDir, filename)
    const label = filename.replace('.zip', '')
    console.log(`[BulkLoad] Processing ${filename}…`)

    const zipBuffer = fs.readFileSync(filePath)
    const stats = await processZipBuffer(zipBuffer, label)

    totalStats.bills.upserted += stats.bills.upserted
    totalStats.bills.skipped += stats.bills.skipped
    totalStats.bills.errors += stats.bills.errors
    totalStats.people.upserted += stats.people.upserted
    totalStats.people.errors += stats.people.errors
    totalStats.rollCalls.upserted += stats.rollCalls.upserted
    totalStats.rollCalls.errors += stats.rollCalls.errors

    console.log(`[BulkLoad] ${label} done:`, JSON.stringify(stats))
  }

  console.log('[BulkLoad] === Local bulk load complete ===')
  console.log('[BulkLoad] Total:', JSON.stringify(totalStats))
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dirIndex = args.indexOf('--dir')
  const stateIndex = args.indexOf('--state')
  const loadAll = args.includes('--all')

  console.log('[BulkLoad] Project Knox — LegiScan Bulk Dataset Loader')
  console.log('[BulkLoad] Started at', new Date().toISOString())

  if (dirIndex !== -1) {
    const dir = args[dirIndex + 1]
    if (!dir) {
      console.error('[BulkLoad] --dir requires a path argument')
      process.exit(1)
    }
    await loadFromDirectory(dir)
  } else {
    const state = stateIndex !== -1 ? args[stateIndex + 1] : (loadAll ? undefined : 'US')
    await loadViaApi(state)
  }

  await prisma.$disconnect()
  console.log('[BulkLoad] Finished at', new Date().toISOString())
}

main().catch((err) => {
  console.error('[BulkLoad] Fatal error:', err)
  process.exit(1)
})
