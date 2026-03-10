/**
 * Per-representative history sync job.
 *
 * Syncs one session's worth of roll call votes for a LegiScan representative.
 *
 * Three-path strategy (fastest to slowest):
 *
 * Path A — RollCalls already tagged with sessionId:
 *   Query rollcall table by sessionId directly. Check/create RepVotes.
 *   Fast: no LegiScan API calls needed for already-synced bills.
 *
 * Path B — Bills already in DB but sessionId not yet backfilled:
 *   Batch-fetch all bills for this session from DB. For those with roll calls,
 *   backfill sessionId and check/create RepVotes via getRollCall.
 *
 * Path C — Bills not in DB (historical sessions only):
 *   Call getMasterList, getBill, getRollCall for each unsynced bill.
 *   Rate-limited and slow — only needed for historical sessions not yet
 *   covered by the main billSync job.
 *
 * Called by:
 *   - pg-boss worker (sync-rep-history queue)
 *   - POST /api/representatives/:id/sync-history (lazy trigger from UI)
 */

import { prisma } from '../lib/prisma'
import { getMasterList, getBill, getRollCall } from '../services/legiscan/client'
import { transformLegiScanBill } from '../services/legiscan/transformers'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function congressFromYearStart(yearStart: number): number {
  return 119 - Math.floor((2025 - yearStart) / 2)
}

export async function syncRepHistoryForSession(
  repId: string,
  peopleId: number,
  sessionId: number,
  yearStart: number,
  yearEnd: number,
  sessionTitle: string,
): Promise<{ synced: number; skipped: number; errors: number }> {
  // Idempotency check
  const existing = await prisma.repSession.findUnique({
    where: { representativeId_sessionId: { representativeId: repId, sessionId } },
  })
  if (existing?.syncedAt) {
    console.log(`[RepHistory] Session ${sessionId} already synced for rep ${repId} — skipping`)
    return { synced: 0, skipped: 0, errors: 0 }
  }

  let synced = 0
  let skipped = 0
  let errors = 0

  // ─── Path A: Roll calls already tagged with this sessionId ─────────────────
  // This is the fast path for sessions already covered by billSync (which now
  // sets sessionId on RollCall rows). Completes in seconds.

  const rollCallsInSession = await prisma.rollCall.findMany({
    where: { sessionId },
    select: { id: true, rollCallId: true },
  })

  if (rollCallsInSession.length > 0) {
    console.log(`[RepHistory] Path A: ${rollCallsInSession.length} roll calls found for session ${sessionId}`)

    for (const rc of rollCallsInSession) {
      try {
        const existingVote = await prisma.repVote.findUnique({
          where: { representativeId_rollCallId: { representativeId: repId, rollCallId: rc.id } },
        })
        if (existingVote) { synced++; continue }

        // RepVote missing — fetch the full roll call to find this rep's vote
        const rollCall = await getRollCall(rc.rollCallId)
        const myVote = rollCall?.votes.find((v) => v.people_id === peopleId)
        if (!myVote) continue

        await prisma.repVote.upsert({
          where: { representativeId_rollCallId: { representativeId: repId, rollCallId: rc.id } },
          create: { rollCallId: rc.id, representativeId: repId, voteText: myVote.vote_text },
          update: { voteText: myVote.vote_text },
        })
        synced++
        await sleep(150)
      } catch (err) {
        console.error(`[RepHistory] Error on rollCallId ${rc.rollCallId}:`, err)
        errors++
      }
    }

    const voteCount = await prisma.repVote.count({
      where: { representativeId: repId, rollCall: { sessionId } },
    })
    await prisma.repSession.upsert({
      where: { representativeId_sessionId: { representativeId: repId, sessionId } },
      create: { representativeId: repId, sessionId, yearStart, yearEnd, sessionTitle, syncedAt: new Date(), voteCount },
      update: { syncedAt: new Date(), voteCount },
    })
    console.log(`[RepHistory] Path A done — rep ${repId} session ${sessionId}: ${synced} votes (${errors} errors)`)
    return { synced, skipped, errors }
  }

  // ─── Path B + C: Use masterlist ────────────────────────────────────────────
  // For sessions where sessionId wasn't set on RollCalls (pre-fix sync).
  // Batch-check all bills in the session against our DB first (Path B),
  // then call getBill only for bills not yet in DB (Path C, historical only).

  const masterlist = await getMasterList(sessionId)
  if (!masterlist) {
    console.warn(`[RepHistory] No masterlist available for session ${sessionId} — marking done`)
    await prisma.repSession.upsert({
      where: { representativeId_sessionId: { representativeId: repId, sessionId } },
      create: { representativeId: repId, sessionId, yearStart, yearEnd, sessionTitle, syncedAt: new Date(), voteCount: 0 },
      update: { syncedAt: new Date() },
    })
    return { synced: 0, skipped: 0, errors: 0 }
  }

  const masterBills = Object.values(masterlist)
  const externalIds = masterBills.map((b) => `legiscan:${b.bill_id}`)

  console.log(`[RepHistory] Path B+C: checking ${masterBills.length} bills for session ${sessionId}`)

  // ─── Path B: Bills already in DB — batch fetch, no API calls ───────────────
  const dbBills = await prisma.bill.findMany({
    where: { externalId: { in: externalIds } },
    select: {
      id: true,
      externalId: true,
      rollCalls: { select: { id: true, rollCallId: true, sessionId: true } },
    },
  })
  const dbBillMap = new Map(dbBills.map((b) => [b.externalId, b]))

  for (const bill of dbBills) {
    if (!bill.rollCalls.length) continue
    for (const rc of bill.rollCalls) {
      try {
        // Backfill sessionId
        if (rc.sessionId == null) {
          await prisma.rollCall.update({ where: { id: rc.id }, data: { sessionId, yearStart } })
        }

        const existingVote = await prisma.repVote.findUnique({
          where: { representativeId_rollCallId: { representativeId: repId, rollCallId: rc.id } },
        })
        if (existingVote) { synced++; continue }

        const rollCall = await getRollCall(rc.rollCallId)
        const myVote = rollCall?.votes.find((v) => v.people_id === peopleId)
        if (!myVote) continue

        await prisma.repVote.upsert({
          where: { representativeId_rollCallId: { representativeId: repId, rollCallId: rc.id } },
          create: { rollCallId: rc.id, representativeId: repId, voteText: myVote.vote_text },
          update: { voteText: myVote.vote_text },
        })
        synced++
        await sleep(150)
      } catch (err) {
        console.error(`[RepHistory] Error on rollCallId ${rc.rollCallId}:`, err)
        errors++
      }
    }
  }

  // ─── Path C: Bills NOT in DB — fetch from LegiScan (historical) ────────────
  const congress = congressFromYearStart(yearStart)
  const notInDb = masterBills.filter((b) => !dbBillMap.has(`legiscan:${b.bill_id}`))

  console.log(`[RepHistory] Path C: ${notInDb.length} bills not in DB — fetching from LegiScan`)

  for (const masterBill of notInDb) {
    try {
      const bill = await getBill(masterBill.bill_id)
      if (!bill?.votes?.length) {
        skipped++
        await sleep(200)
        continue
      }

      const result = transformLegiScanBill(bill, congress)
      if (!result) { skipped++; await sleep(200); continue }
      const { primarySponsorPeopleId: _p, cosponsorPeopleIds: _c, ...billData } = result

      const savedBill = await prisma.bill.upsert({
        where: { externalId: billData.externalId },
        create: billData,
        update: { status: billData.status, lastActionDate: billData.lastActionDate, lastSyncedAt: new Date() },
        select: { id: true },
      })

      for (const voteEntry of bill.votes) {
        const rollCall = await getRollCall(voteEntry.roll_call_id)
        if (!rollCall) continue

        const myVote = rollCall.votes.find((v) => v.people_id === peopleId)
        if (!myVote) continue

        const chamber = rollCall.chamber === 'H' ? 'house' : 'senate'
        const dbRc = await prisma.rollCall.upsert({
          where: { rollCallId: rollCall.roll_call_id },
          create: {
            rollCallId: rollCall.roll_call_id,
            billId: savedBill.id,
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
          select: { id: true },
        })

        await prisma.repVote.upsert({
          where: { representativeId_rollCallId: { representativeId: repId, rollCallId: dbRc.id } },
          create: { rollCallId: dbRc.id, representativeId: repId, voteText: myVote.vote_text },
          update: { voteText: myVote.vote_text },
        })
        synced++
        await sleep(150)
      }
    } catch (err) {
      console.error(`[RepHistory] Error on bill ${masterBill.bill_id}:`, err)
      errors++
    }
    await sleep(200)
  }

  const voteCount = await prisma.repVote.count({
    where: { representativeId: repId, rollCall: { sessionId } },
  })
  await prisma.repSession.upsert({
    where: { representativeId_sessionId: { representativeId: repId, sessionId } },
    create: { representativeId: repId, sessionId, yearStart, yearEnd, sessionTitle, syncedAt: new Date(), voteCount },
    update: { syncedAt: new Date(), voteCount },
  })

  console.log(
    `[RepHistory] Done — rep ${repId} session ${sessionId}: ${synced} synced, ${skipped} skipped, ${errors} errors`,
  )
  return { synced, skipped, errors }
}
