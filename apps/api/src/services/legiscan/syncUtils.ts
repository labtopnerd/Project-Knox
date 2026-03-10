/**
 * Shared LegiScan sync utilities used by both the scheduled bill sync job
 * and the on-demand per-representative sync endpoint.
 */

import { prisma } from '../../lib/prisma'
import { getRollCall } from './client'
import type { LegiScanBillVote } from './client'
import { cacheGet, cacheSet, TTL } from '../../lib/redis'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Fetch and store individual member votes for each roll call on a bill.
 * Guards against re-processing via a Redis "done" flag (immutable once set).
 */
export async function syncRollCallsForBill(
  dbBillId: string,
  votes: LegiScanBillVote[],
  sessionMeta?: { sessionId: number; yearStart: number },
): Promise<void> {
  for (const voteSummary of votes) {
    const doneKey = `legiscan:rc:done:${voteSummary.roll_call_id}`
    const alreadyDone = await cacheGet<boolean>(doneKey)
    if (alreadyDone) continue

    const rollCall = await getRollCall(voteSummary.roll_call_id)
    if (!rollCall) continue

    const chamber = rollCall.chamber === 'H' ? 'house' : 'senate'

    const dbRollCall = await prisma.rollCall.upsert({
      where: { rollCallId: rollCall.roll_call_id },
      create: {
        rollCallId: rollCall.roll_call_id,
        billId: dbBillId,
        date: new Date(rollCall.date),
        description: rollCall.desc,
        yea: rollCall.yea,
        nay: rollCall.nay,
        nv: rollCall.nv,
        absent: rollCall.absent,
        total: rollCall.total,
        passed: rollCall.passed === 1,
        chamber,
        ...(sessionMeta ?? {}),
      },
      update: {
        yea: rollCall.yea,
        nay: rollCall.nay,
        nv: rollCall.nv,
        absent: rollCall.absent,
        total: rollCall.total,
        passed: rollCall.passed === 1,
        ...(sessionMeta ?? {}),
      },
    })

    for (const memberVote of rollCall.votes) {
      const rep = await prisma.representative.findUnique({
        where: { externalId: `legiscan:${memberVote.people_id}` },
        select: { id: true },
      })
      if (!rep) continue

      await prisma.repVote.upsert({
        where: {
          representativeId_rollCallId: {
            representativeId: rep.id,
            rollCallId: dbRollCall.id,
          },
        },
        create: {
          rollCallId: dbRollCall.id,
          representativeId: rep.id,
          voteText: memberVote.vote_text,
        },
        update: { voteText: memberVote.vote_text },
      })
    }

    await cacheSet(doneKey, true, TTL.LEGISCAN_ROLLCALL)
    await sleep(150)
  }
}
