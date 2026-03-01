/**
 * Bill Sync Job — runs every 6 hours via node-cron or Vercel Cron
 *
 * Fetches new and updated bills from:
 * 1. Congress.gov API (federal bills)
 * 2. OpenStates API v3 (state bills — all 50 states)
 *
 * Uses incremental sync: only fetches bills updated since the last sync timestamp.
 * Upserts into the database using externalId as the unique key.
 */

import { prisma } from '../lib/prisma'
import { getRecentBills, getBillDetail, getBillSummaries, getBillActions, getRelatedBills } from '../services/congress/client'
import { transformCongressBill } from '../services/congress/transformers'
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
  federal: { synced: number; errors: number }
  state: { synced: number; errors: number; statesProcessed: number }
  enriched: number
  duration: number
}

/**
 * Sync federal bills from Congress.gov
 */
export async function syncFederalBills(
  congress: number = 119,
  limitPages: number = 5,
): Promise<{ synced: number; errors: number }> {
  let synced = 0
  let errors = 0

  console.log(`[BillSync] Starting federal bill sync for Congress #${congress}`)

  for (let page = 0; page < limitPages; page++) {
    try {
      const offset = page * 20
      const response = await getRecentBills(congress, offset, 20)

      if (!response.bills || response.bills.length === 0) {
        console.log(`[BillSync] No more federal bills at offset ${offset}`)
        break
      }

      for (const bill of response.bills) {
        try {
          const billData = transformCongressBill(bill)

          // Fetch detail + summaries in parallel (responses are cached)
          const [detailRes, summariesRes] = await Promise.allSettled([
            getBillDetail(bill.congress, bill.type, bill.number),
            getBillSummaries(bill.congress, bill.type, bill.number),
          ])

          const detail = detailRes.status === 'fulfilled' ? detailRes.value.bill : null
          const summary = summariesRes.status === 'fulfilled'
            ? (summariesRes.value.summaries?.[0]?.text ?? null)
            : null

          // Resolve or upsert the sponsor representative
          let sponsorId: string | undefined
          if (detail?.sponsors?.[0]) {
            const s = detail.sponsors[0]
            const externalId = `congress:${s.bioguideId}`
            const rep = await prisma.representative.upsert({
              where: { externalId },
              create: {
                externalId,
                source: 'congress',
                fullName: s.fullName,
                party: s.party ?? null,
                chamber: bill.originChamber?.toLowerCase() === 'senate' ? 'senate' : 'house',
                level: 'federal',
                stateCode: s.state ?? null,
                isActive: true,
              },
              update: {
                fullName: s.fullName,
                party: s.party ?? null,
                stateCode: s.state ?? null,
              },
              select: { id: true },
            })
            sponsorId = rep.id
          }

          // Issue tags from policyArea
          const issueTags: string[] = detail?.policyArea?.name
            ? [detail.policyArea.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')]
            : billData.issueTags

          await prisma.bill.upsert({
            where: { externalId: billData.externalId },
            create: {
              ...billData,
              issueTags,
              ...(summary ? { summary } : {}),
              ...(sponsorId ? { sponsor: { connect: { id: sponsorId } } } : {}),
            },
            update: {
              title: billData.title,
              status: billData.status,
              lastActionDate: billData.lastActionDate,
              lastActionText: billData.lastActionText,
              issueTags,
              ...(summary ? { summary } : {}),
              ...(sponsorId ? { sponsor: { connect: { id: sponsorId } } } : {}),
              lastSyncedAt: new Date(),
            },
          })

          // Fetch and store legislative actions + related bills
          try {
            const [actions, related] = await Promise.all([
              getBillActions(bill.congress, bill.type, bill.number),
              getRelatedBills(bill.congress, bill.type, bill.number),
            ])
            const mapped = actions.map((a) => ({
              date: a.actionDate,
              text: a.text,
              type: a.type ?? null,
              actionCode: a.actionCode ?? null,
            }))
            const mappedRelated = related.map((r) => ({
              title: r.title,
              billNumber: `${r.type} ${r.number}`,
              url: r.url,
              relationshipType: r.relationshipDetails?.[0]?.type ?? 'related',
            }))
            await prisma.bill.update({
              where: { externalId: billData.externalId },
              data: {
                actions: mapped as Prisma.InputJsonValue,
                relatedBills: mappedRelated as Prisma.InputJsonValue,
              },
            })
          } catch (err) {
            console.warn(`[BillSync] Could not fetch actions/relatedBills for ${bill.number}:`, err instanceof Error ? err.message : err)
          }

          synced++
        } catch (err) {
          console.error(`[BillSync] Error upserting federal bill ${bill.number}:`, err)
          errors++
        }
      }
    } catch (err) {
      console.error(`[BillSync] Error fetching federal bills page ${page}:`, err)
      errors++
      break
    }
  }

  console.log(`[BillSync] Federal sync complete: ${synced} synced, ${errors} errors`)
  return { synced, errors }
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
    where: { aiEnrichedAt: null, summary: { not: null } },
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
    syncFederalBills(119, 5),
    syncStateBills(1),
  ])

  const enriched = await enrichUnenrichedBills()

  const duration = Date.now() - start
  console.log(`[BillSync] === Full sync complete in ${duration}ms ===`)

  return { federal, state, enriched, duration }
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
