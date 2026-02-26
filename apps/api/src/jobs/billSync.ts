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
import { getRecentBills } from '../services/congress/client'
import { transformCongressBill } from '../services/congress/transformers'
import { getBillsUpdatedSince } from '../services/openstates/client'
import { transformOpenStatesBill } from '../services/openstates/transformers'

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
          const data = transformCongressBill(bill)
          const { sponsorExternalId, ...billData } = data as typeof data & { sponsorExternalId?: string }

          // Find sponsor if we have their external ID
          let sponsorId: string | undefined
          if (sponsorExternalId) {
            const rep = await prisma.representative.findUnique({
              where: { externalId: sponsorExternalId },
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
              lastSyncedAt: new Date(),
            },
          })
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
 * Full sync job — run both federal and state syncs.
 */
export async function runFullSync(): Promise<SyncResult> {
  const start = Date.now()
  console.log('[BillSync] === Starting full bill sync ===')

  const [federal, state] = await Promise.all([
    syncFederalBills(119, 5),
    syncStateBills(1),
  ])

  const duration = Date.now() - start
  console.log(`[BillSync] === Full sync complete in ${duration}ms ===`)

  return { federal, state, duration }
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
