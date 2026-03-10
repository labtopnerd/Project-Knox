/**
 * Bill Sync Job — runs every 6 hours via node-cron or Vercel Cron
 *
 * Fetches new and updated bills from:
 * 1. LegiScan API (federal bills)
 * 2. OpenStates API v3 (state bills — all 50 states)
 *
 * Uses change_hash for incremental sync: skips bills whose hash hasn't changed.
 * Upserts into the database using externalId as the unique key.
 */

import { prisma } from '../lib/prisma'
import { getUSSessionId, getMasterList, getBill } from '../services/legiscan/client'
import { transformLegiScanBill, parseStateFromDistrict, parseDistrictNumber, normalizeParty } from '../services/legiscan/transformers'
import { syncRollCallsForBill } from '../services/legiscan/syncUtils'
import { cacheGet, cacheSet, TTL } from '../lib/redis'
import { getBillsUpdatedSince } from '../services/openstates/client'
import { transformOpenStatesBill } from '../services/openstates/transformers'
import { enrichBill } from '../services/ai/groq'
import type { Prisma } from '@prisma/client'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// US state codes for OpenStates sync
const US_STATES = [
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
  'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
  'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
  'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
  'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
]

export interface SyncResult {
  federal: { synced: number; skipped: number; errors: number }
  state: { synced: number; errors: number; statesProcessed: number }
  enriched: number
  duration: number
}

/**
 * Sync federal bills from LegiScan using change_hash to minimize API calls.
 */
export async function syncFederalBills(
  congress: number = 119,
): Promise<{ synced: number; skipped: number; errors: number }> {
  let synced = 0
  let skipped = 0
  let errors = 0

  console.log(`[BillSync] Starting LegiScan federal bill sync for Congress #${congress}`)

  const sessionId = await getUSSessionId(congress)
  if (!sessionId) {
    console.warn(`[BillSync] No LegiScan session found for Congress #${congress} — skipping federal sync`)
    return { synced, skipped, errors }
  }

  const masterlist = await getMasterList(sessionId)
  if (!masterlist) {
    console.warn('[BillSync] Could not fetch LegiScan masterlist — skipping federal sync')
    return { synced, skipped, errors }
  }

  const entries = Object.values(masterlist)
  console.log(`[BillSync] Processing ${entries.length} bills from LegiScan masterlist`)

  for (const masterBill of entries) {
    try {
      // Check if bill has changed since last sync
      const hashKey = `legiscan:hash:${masterBill.bill_id}`
      const storedHash = await cacheGet<string>(hashKey)
      if (storedHash === masterBill.change_hash) {
        skipped++
        continue
      }

      const bill = await getBill(masterBill.bill_id)
      if (!bill) {
        errors++
        continue
      }

      const result = transformLegiScanBill(bill, congress)
      if (!result) {
        errors++
        continue
      }

      const { primarySponsorPeopleId, cosponsorPeopleIds, ...billData } = result

      // Upsert primary sponsor
      let sponsorId: string | undefined
      if (primarySponsorPeopleId != null) {
        const sponsorExternalId = `legiscan:${primarySponsorPeopleId}`
        const sponsor = bill.sponsors.find((s) => s.people_id === primarySponsorPeopleId)
        if (sponsor) {
          const sponsorStateCode = sponsor.district ? parseStateFromDistrict(sponsor.district) || null : null
          const sponsorDistrict = sponsor.district ? parseDistrictNumber(sponsor.district) : null
          const rep = await prisma.representative.upsert({
            where: { externalId: sponsorExternalId },
            create: {
              externalId: sponsorExternalId,
              source: 'congress',
              fullName: sponsor.name,
              party: sponsor.party ? normalizeParty(sponsor.party) : null,
              chamber: billData.chamber ?? 'house',
              level: 'federal',
              stateCode: sponsorStateCode,
              district: sponsorDistrict,
              isActive: true,
              lastSyncedAt: new Date(),
            },
            update: {
              fullName: sponsor.name,
              party: sponsor.party ? normalizeParty(sponsor.party) : null,
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

      // Upsert cosponsor links (only for reps already in DB)
      for (const peopleId of cosponsorPeopleIds) {
        const cosponsorExternalId = `legiscan:${peopleId}`
        const cosponsorRep = await prisma.representative.findUnique({
          where: { externalId: cosponsorExternalId },
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

      // Sync roll call votes for this bill
      if (bill.votes?.length) {
        const dbBill = await prisma.bill.findUnique({
          where: { externalId: billData.externalId },
          select: { id: true },
        })
        if (dbBill) {
          const sessionMeta = bill.session
            ? { sessionId: bill.session.session_id, yearStart: bill.session.year_start }
            : undefined
          await syncRollCallsForBill(dbBill.id, bill.votes, sessionMeta)
        }
      }

      // Cache the change_hash so we skip this bill on the next run if unchanged
      await cacheSet(hashKey, masterBill.change_hash, TTL.LEGISCAN_MASTER)

      synced++
    } catch (err) {
      console.error(`[BillSync] Error upserting LegiScan bill ${masterBill.number}:`, err)
      errors++
    }

    await sleep(100)
  }

  console.log(`[BillSync] Federal sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`)
  return { synced, skipped, errors }
}

/**
 * Sync state bills from OpenStates for a given state.
 */
async function syncStateForJurisdiction(
  state: string,
  since: Date,
): Promise<{ synced: number; errors: number }> {
  let synced = 0
  let errors = 0

  try {
    const bills = await getBillsUpdatedSince(state, since)
    for (const bill of bills) {
      try {
        const data = transformOpenStatesBill(bill)
        const { sponsorPersonId, ...billData } = data as typeof data & { sponsorPersonId?: string }

        let sponsorId: string | undefined
        if (sponsorPersonId) {
          const rep = await prisma.representative.findUnique({
            where: { externalId: `openstates:${sponsorPersonId}` },
            select: { id: true },
          })
          sponsorId = rep?.id
        }

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
            issueTags: billData.issueTags,
            lastSyncedAt: new Date(),
          },
        })
        synced++
      } catch (err) {
        console.error(`[BillSync] Error upserting state bill ${bill.identifier} (${state}):`, err)
        errors++
      }
    }
  } catch (err) {
    console.error(`[BillSync] Error fetching state bills for ${state}:`, err)
    errors++
  }

  return { synced, errors }
}

/**
 * Sync all state bills from OpenStates.
 * Throttled to avoid hitting the 500 req/day rate limit.
 */
export async function syncStateBills(
  sinceDays: number = 1,
  stateSubset?: string[],
): Promise<{ synced: number; errors: number; statesProcessed: number }> {
  const since = new Date()
  since.setDate(since.getDate() - sinceDays)

  const states = stateSubset ?? US_STATES
  let totalSynced = 0
  let totalErrors = 0

  console.log(`[BillSync] Starting state bill sync for ${states.length} states since ${since.toISOString()}`)

  for (const state of states) {
    const result = await syncStateForJurisdiction(state, since)
    totalSynced += result.synced
    totalErrors += result.errors

    // Small delay to be kind to the API (500 req/day limit)
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  console.log(
    `[BillSync] State sync complete: ${totalSynced} synced, ${totalErrors} errors, ${states.length} states`,
  )

  return { synced: totalSynced, errors: totalErrors, statesProcessed: states.length }
}

/**
 * Enrich up to 50 unenriched bills per run using Groq AI.
 * Caller must ensure GROQ_API_KEY is set; if not, this is a no-op.
 */
export async function enrichUnenrichedBills(): Promise<number> {
  if (!process.env.GROQ_API_KEY) {
    console.log('[BillSync] GROQ_API_KEY not set — skipping AI enrichment')
    return 0
  }

  const unenriched = await prisma.bill.findMany({
    where: { aiEnrichedAt: null },
    take: 50,
    include: { sponsor: { select: { fullName: true, party: true, stateCode: true } } },
  })

  console.log(`[BillSync] Enriching ${unenriched.length} unenriched bills via Groq`)
  let enriched = 0

  for (const bill of unenriched) {
    const result = await enrichBill({
      title: bill.title,
      summary: bill.summary,
      lastActionText: bill.lastActionText,
      issueTags: bill.issueTags,
      status: bill.status,
      sponsorName: bill.sponsor?.fullName,
      sponsorParty: bill.sponsor?.party ?? undefined,
      sponsorState: bill.sponsor?.stateCode ?? undefined,
    })

    if (result) {
      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          aiSummary: result.aiSummary,
          keyProvisions: result.keyProvisions,
          whoItAffects: result.whoItAffects,
          proArguments: result.proArguments as Prisma.InputJsonValue,
          conArguments: result.conArguments as Prisma.InputJsonValue,
          aiEnrichedAt: new Date(),
        },
      })
      enriched++
    }

    // Stay under 30 req/min limit
    await sleep(2100)
  }

  console.log(`[BillSync] AI enrichment complete: ${enriched}/${unenriched.length} enriched`)
  return enriched
}

/**
 * Full sync job — run both federal and state syncs, then enrich unenriched bills.
 */
export async function runFullSync(): Promise<SyncResult> {
  const start = Date.now()
  console.log('[BillSync] === Starting full bill sync ===')

  const [federal, state] = await Promise.all([
    syncFederalBills(119),
    syncStateBills(1),
  ])

  const enriched = await enrichUnenrichedBills()

  const duration = Date.now() - start
  console.log(`[BillSync] === Full sync complete in ${duration}ms ===`)

  return { federal, state, enriched, duration }
}

/**
 * Backfill roll calls for bills already in the DB that have vote summaries
 * (stored in rawData) but no RollCall rows yet.
 *
 * Reads rawData.votes[] from every federal LegiScan bill, then calls
 * syncRollCallsForBill for each one that has unprocessed roll calls.
 * The `legiscan:rc:done:` guard prevents re-fetching already-processed ones.
 */
export async function backfillRollCalls(limit = 50): Promise<{ processed: number; rollCallsAdded: number }> {
  console.log(`[BillSync] Starting roll call backfill (limit=${limit})`)

  const bills = await prisma.bill.findMany({
    where: { source: 'legiscan' },
    select: { id: true, rawData: true },
    take: limit,
  })

  let processed = 0
  let rollCallsBefore = await prisma.rollCall.count()

  for (const bill of bills) {
    const raw = bill.rawData as Record<string, unknown> | null
    const votes = (raw?.votes ?? []) as Array<{ roll_call_id: number; date: string; desc: string; yea: number; nay: number; nv: number; absent: number; total: number; passed: number; chamber: string; chamber_id: number }>
    if (!votes.length) continue

    await syncRollCallsForBill(bill.id, votes)
    processed++
  }

  const rollCallsAfter = await prisma.rollCall.count()
  const added = rollCallsAfter - rollCallsBefore

  console.log(`[BillSync] Roll call backfill complete: ${processed} bills processed, ${added} roll calls added`)
  return { processed, rollCallsAdded: added }
}

// Allow running directly: tsx src/jobs/billSync.ts
if (require.main === module) {
  runFullSync()
    .then((result) => {
      console.log('[BillSync] Result:', JSON.stringify(result, null, 2))
      process.exit(0)
    })
    .catch((err) => {
      console.error('[BillSync] Fatal error:', err)
      process.exit(1)
    })
}
