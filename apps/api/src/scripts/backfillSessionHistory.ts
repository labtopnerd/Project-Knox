/**
 * Session-first historical vote backfill.
 *
 * Processes each distinct unsynced LegiScan session ONCE, writing RepVote rows
 * for ALL known representatives in a single pass. This is far more efficient
 * than per-rep sync (8 sessions vs 870 individual jobs).
 *
 * Process:
 *   1. Build peopleIdMap (people_id → rep.id) for all reps with LegiScan data
 *   2. Find distinct unsynced session_ids from RepSession table (yearStart >= YEAR_FROM)
 *   3. For each session:
 *      a. getMasterList → filter to status > 1 (skip intro-only bills)
 *      b. Batch-check which bills are already in DB
 *      c. Bills in DB → check existing roll calls → getRollCall if unprocessed
 *      d. Bills not in DB → getBill → upsert → getRollCall for each vote
 *      e. Write RepVotes for ALL reps in each roll call in one pass
 *      f. Mark all RepSessions for this session_id as synced
 *
 * Options (env vars):
 *   YEAR_FROM=2021       only process sessions from yearStart >= this year (default: 2021)
 *   SESSION_ID=1823      only process this specific session (optional)
 *   SLEEP_MS=200         ms between getRollCall API calls (default: 200)
 *   DRY_RUN=1            log actions but don't write to DB
 *
 * Run with:
 *   npx tsx src/scripts/backfillSessionHistory.ts
 *   SESSION_ID=2041 npx tsx src/scripts/backfillSessionHistory.ts
 *   DRY_RUN=1 npx tsx src/scripts/backfillSessionHistory.ts
 */

import 'dotenv/config'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { getMasterList, getBill, getRollCall } from '../services/legiscan/client'
import { transformLegiScanBill, parseBillNumber } from '../services/legiscan/transformers'

const YEAR_FROM = parseInt(process.env.YEAR_FROM ?? '2021', 10)
const SESSION_ID_FILTER = process.env.SESSION_ID ? parseInt(process.env.SESSION_ID, 10) : null
const SLEEP_MS = parseInt(process.env.SLEEP_MS ?? '200', 10)
const DRY_RUN = process.env.DRY_RUN === '1'
// Sessions with fewer unsynced reps than this are skipped — let the per-rep nightly cron handle them.
// Federal sessions have 390-470 reps; state sessions have 1-4. Default of 50 separates them cleanly.
const MIN_REPS = parseInt(process.env.MIN_REPS ?? '50', 10)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function congressFromYearStart(yearStart: number): number {
  return 119 - Math.floor((2025 - yearStart) / 2)
}

// ─── Step 1: Build people_id → rep.id map ─────────────────────────────────────

async function buildPeopleIdMap(): Promise<Map<number, string>> {
  const reps = await prisma.representative.findMany({
    where: {
      OR: [
        { externalId: { startsWith: 'legiscan:' } },
        { legiscanPeopleId: { not: null } },
      ],
    },
    select: { id: true, externalId: true, legiscanPeopleId: true },
  })

  const map = new Map<number, string>()
  for (const rep of reps) {
    if (rep.externalId.startsWith('legiscan:')) {
      const peopleId = parseInt(rep.externalId.replace('legiscan:', ''), 10)
      if (!isNaN(peopleId)) map.set(peopleId, rep.id)
    }
    // State reps matched via matchStateReps.ts — may overlap with legiscan: reps, that's fine
    if (rep.legiscanPeopleId != null) {
      map.set(rep.legiscanPeopleId, rep.id)
    }
  }
  return map
}

// ─── Roll call processing ──────────────────────────────────────────────────────

/**
 * Pre-loads the set of LegiScan roll_call_ids already fully processed for this
 * session (i.e. they exist in DB and have at least one RepVote).
 */
async function loadProcessedRollCallIds(sessionId: number): Promise<Set<number>> {
  const processed = await prisma.rollCall.findMany({
    where: { sessionId, repVotes: { some: {} } },
    select: { rollCallId: true },
  })
  return new Set(processed.map((rc) => rc.rollCallId))
}

/**
 * Fetches a single roll call from LegiScan and writes RepVotes for all reps
 * in the peopleIdMap. Upserts the RollCall row with sessionId/yearStart.
 *
 * Returns { votes } count written (0 if skipped or no reps matched).
 */
async function processRollCall(
  legiScanRollCallId: number,
  billDbId: string,
  sessionId: number,
  yearStart: number,
  peopleIdMap: Map<number, string>,
  processedIds: Set<number>,
): Promise<{ votes: number; skipped: boolean }> {
  if (processedIds.has(legiScanRollCallId)) {
    return { votes: 0, skipped: true }
  }

  const rollCall = await getRollCall(legiScanRollCallId)
  if (!rollCall) {
    processedIds.add(legiScanRollCallId) // don't retry
    return { votes: 0, skipped: true }
  }

  // Mark as processed so we don't re-fetch within this session run
  processedIds.add(legiScanRollCallId)

  const repsInThisVote = rollCall.votes.filter((v) => peopleIdMap.has(v.people_id))
  if (repsInThisVote.length === 0) {
    return { votes: 0, skipped: true }
  }

  if (DRY_RUN) {
    return { votes: repsInThisVote.length, skipped: false }
  }

  const chamber = rollCall.chamber === 'H' ? 'house' : 'senate'
  const dbRc = await prisma.rollCall.upsert({
    where: { rollCallId: rollCall.roll_call_id },
    create: {
      rollCallId: rollCall.roll_call_id,
      billId: billDbId,
      date: new Date(rollCall.date),
      description: rollCall.desc,
      yea: rollCall.yea,
      nay: rollCall.nay,
      nv: rollCall.nv,
      absent: rollCall.absent,
      total: rollCall.total,
      passed: rollCall.passed === 1,
      chamber,
      sessionId,
      yearStart,
    },
    update: { sessionId, yearStart },
  })

  // Batch all matching rep votes in one query instead of N individual upserts
  const votesToCreate = rollCall.votes
    .filter((v) => peopleIdMap.has(v.people_id))
    .map((v) => ({
      rollCallId: dbRc.id,
      representativeId: peopleIdMap.get(v.people_id)!,
      voteText: v.vote_text,
    }))

  if (votesToCreate.length === 0) return { votes: 0, skipped: true }

  const created = await prisma.repVote.createMany({ data: votesToCreate, skipDuplicates: true })
  return { votes: created.count, skipped: false }
}

// ─── Session processing ────────────────────────────────────────────────────────

async function processSession(
  sessionId: number,
  yearStart: number,
  yearEnd: number,
  sessionTitle: string,
  peopleIdMap: Map<number, string>,
): Promise<{ bills: number; rollCallsNew: number; votes: number; skipped: number; errors: number }> {
  console.log(`\n[Backfill] ══ Session ${sessionId}: ${sessionTitle} (${yearStart}–${yearEnd}) ══`)

  const masterlist = await getMasterList(sessionId)
  if (!masterlist) {
    console.warn(`[Backfill] No masterlist for session ${sessionId} — skipping`)
    return { bills: 0, rollCallsNew: 0, votes: 0, skipped: 0, errors: 0 }
  }

  const allBills = Object.values(masterlist)
  // status=1 means "Introduced" only — almost certainly has no roll call votes
  // Note: masterlist uses `status` (not `status_id`) — the bill detail uses `status_id`
  const activeBills = allBills.filter((b) => b.status > 1)
  console.log(
    `[Backfill] ${allBills.length} total bills, ${activeBills.length} active (${allBills.length - activeBills.length} intro-only skipped)`,
  )

  const processedIds = await loadProcessedRollCallIds(sessionId)
  console.log(`[Backfill] ${processedIds.size} roll calls already processed for session ${sessionId}`)

  const congress = congressFromYearStart(yearStart)

  // Derive DB externalIds for the active bills so we can batch-fetch
  const billIdToExternalId = new Map<number, string>()
  for (const b of activeBills) {
    const parsed = parseBillNumber(b.number)
    if (parsed) {
      billIdToExternalId.set(b.bill_id, `congress:${congress}:${parsed.type}:${parsed.number}`)
    } else {
      // State bill — stored (or will be stored) as legiscan:{bill_id}
      billIdToExternalId.set(b.bill_id, `legiscan:${b.bill_id}`)
    }
  }

  const allExternalIds = [...billIdToExternalId.values()]
  const dbBills = await prisma.bill.findMany({
    where: { externalId: { in: allExternalIds } },
    select: {
      id: true,
      externalId: true,
      rollCalls: { select: { id: true, rollCallId: true } },
    },
  })
  const dbBillMap = new Map(dbBills.map((b) => [b.externalId, b]))
  console.log(`[Backfill] ${dbBills.length}/${activeBills.length} active bills already in DB`)

  let bills = 0
  let rollCallsNew = 0
  let votes = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < activeBills.length; i++) {
    const masterBill = activeBills[i]!
    const externalId = billIdToExternalId.get(masterBill.bill_id)!

    try {
      const dbBill = dbBillMap.get(externalId)

      if (dbBill) {
        // ── Bill already in DB — check its roll calls ──────────────────────────
        if (dbBill.rollCalls.length === 0) {
          skipped++
          continue
        }

        for (const rc of dbBill.rollCalls) {
          const result = await processRollCall(
            rc.rollCallId, dbBill.id, sessionId, yearStart, peopleIdMap, processedIds,
          )
          if (result.skipped) {
            skipped++
          } else {
            rollCallsNew++
            votes += result.votes
            await sleep(SLEEP_MS)
          }
        }
        bills++
      } else {
        // ── Bill not in DB — fetch from LegiScan ───────────────────────────────
        const bill = await getBill(masterBill.bill_id)
        await sleep(SLEEP_MS)

        if (!bill?.votes?.length) {
          skipped++
          continue
        }

        let billDbId: string

        if (DRY_RUN) {
          billDbId = 'dry-run'
        } else {
          const parsed = parseBillNumber(bill.bill_number)
          if (parsed) {
            // Federal bill — use existing transformer for full fidelity
            const transformed = transformLegiScanBill(bill, congress)
            if (!transformed) { skipped++; continue }
            const { primarySponsorPeopleId: _p, cosponsorPeopleIds: _c, ...billData } = transformed
            const saved = await prisma.bill.upsert({
              where: { externalId: billData.externalId },
              create: billData,
              update: { status: billData.status, lastActionDate: billData.lastActionDate, lastSyncedAt: new Date() },
              select: { id: true },
            })
            billDbId = saved.id
          } else {
            // State bill — minimal record using legiscan:{bill_id} externalId
            const saved = await prisma.bill.upsert({
              where: { externalId: `legiscan:${bill.bill_id}` },
              create: {
                externalId: `legiscan:${bill.bill_id}`,
                source: 'legiscan',
                billNumber: bill.bill_number,
                title: bill.title,
                summary: bill.description || null,
                status: 'introduced',
                level: 'state',
                stateCode: bill.state?.length === 2 ? bill.state : null,
                lastActionDate: bill.status_date ? new Date(bill.status_date) : null,
                lastSyncedAt: new Date(),
                rawData: bill as unknown as Prisma.InputJsonValue,
              },
              update: { lastSyncedAt: new Date() },
              select: { id: true },
            })
            billDbId = saved.id
          }
        }

        for (const voteEntry of bill.votes) {
          const result = await processRollCall(
            voteEntry.roll_call_id, billDbId, sessionId, yearStart, peopleIdMap, processedIds,
          )
          if (result.skipped) {
            skipped++
          } else {
            rollCallsNew++
            votes += result.votes
            await sleep(SLEEP_MS)
          }
        }
        bills++
      }
    } catch (err) {
      console.error(`[Backfill] Error on bill ${masterBill.bill_id}:`, err)
      errors++
    }

    if ((i + 1) % 100 === 0 || i === activeBills.length - 1) {
      console.log(
        `[Backfill] ${i + 1}/${activeBills.length} bills — ${rollCallsNew} roll calls, ${votes} votes, ${skipped} skipped, ${errors} errors`,
      )
    }
  }

  // ── Mark all RepSessions for this session as synced ──────────────────────────
  if (!DRY_RUN) {
    const unsyncedRepSessions = await prisma.repSession.findMany({
      where: { sessionId, syncedAt: null },
      select: { representativeId: true },
    })

    let marked = 0
    for (const rs of unsyncedRepSessions) {
      const voteCount = await prisma.repVote.count({
        where: { representativeId: rs.representativeId, rollCall: { sessionId } },
      })
      if (voteCount > 0) {
        await prisma.repSession.update({
          where: { representativeId_sessionId: { representativeId: rs.representativeId, sessionId } },
          data: { syncedAt: new Date(), voteCount },
        })
        marked++
      }
    }
    console.log(`[Backfill] Marked ${marked}/${unsyncedRepSessions.length} RepSessions as synced`)
  } else {
    console.log(`[Backfill] DRY_RUN — would mark RepSessions as synced`)
  }

  return { bills, rollCallsNew, votes, skipped, errors }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('[Backfill] *** DRY_RUN mode — no writes will be made ***\n')

  console.log('[Backfill] Building representative people_id map...')
  const peopleIdMap = await buildPeopleIdMap()
  console.log(`[Backfill] ${peopleIdMap.size} reps in people_id map`)

  // Find distinct unsynced sessions
  const sessionWhere = SESSION_ID_FILTER
    ? { sessionId: SESSION_ID_FILTER, syncedAt: null }
    : { syncedAt: null, yearStart: { gte: YEAR_FROM } }

  const unsyncedSessions = await prisma.repSession.groupBy({
    by: ['sessionId', 'yearStart', 'yearEnd', 'sessionTitle'],
    where: sessionWhere,
    orderBy: { yearStart: 'asc' },
  })

  if (unsyncedSessions.length === 0) {
    console.log('[Backfill] No unsynced sessions found — all done!')
    await prisma.$disconnect()
    return
  }

  // Count unsynced reps per session to decide which ones to process here
  const sessionRepCounts = new Map<number, number>()
  for (const s of unsyncedSessions) {
    const count = await prisma.repSession.count({
      where: { sessionId: s.sessionId, syncedAt: null },
    })
    sessionRepCounts.set(s.sessionId, count)
  }

  const sessionsToProcess = unsyncedSessions.filter((s) => sessionRepCounts.get(s.sessionId)! >= MIN_REPS)
  const sessionsSkipped = unsyncedSessions.filter((s) => sessionRepCounts.get(s.sessionId)! < MIN_REPS)

  console.log(`[Backfill] ${unsyncedSessions.length} distinct sessions — processing ${sessionsToProcess.length}, skipping ${sessionsSkipped.length} (< ${MIN_REPS} reps)\n`)
  for (const s of sessionsToProcess) {
    console.log(`  Session ${s.sessionId}: ${s.sessionTitle} (${s.yearStart}–${s.yearEnd}) — ${sessionRepCounts.get(s.sessionId)} reps`)
  }
  for (const s of sessionsSkipped) {
    console.log(`  [skipped] Session ${s.sessionId}: ${s.sessionTitle} — ${sessionRepCounts.get(s.sessionId)} reps (use nightly per-rep cron)`)
  }

  if (sessionsToProcess.length === 0) {
    console.log('\n[Backfill] No qualifying sessions — done!')
    await prisma.$disconnect()
    return
  }

  const grandTotal = { bills: 0, rollCallsNew: 0, votes: 0, skipped: 0, errors: 0 }

  for (const session of sessionsToProcess) {
    const result = await processSession(
      session.sessionId,
      session.yearStart,
      session.yearEnd,
      session.sessionTitle,
      peopleIdMap,
    )
    grandTotal.bills += result.bills
    grandTotal.rollCallsNew += result.rollCallsNew
    grandTotal.votes += result.votes
    grandTotal.skipped += result.skipped
    grandTotal.errors += result.errors

    console.log(
      `[Backfill] Session ${session.sessionId} complete — ${result.bills} bills, ${result.rollCallsNew} roll calls, ${result.votes} votes, ${result.skipped} skipped, ${result.errors} errors`,
    )
  }

  console.log('\n[Backfill] ══ ALL SESSIONS COMPLETE ══')
  console.log(`[Backfill] Total: ${grandTotal.bills} bills, ${grandTotal.rollCallsNew} roll calls, ${grandTotal.votes} votes, ${grandTotal.skipped} skipped, ${grandTotal.errors} errors`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
