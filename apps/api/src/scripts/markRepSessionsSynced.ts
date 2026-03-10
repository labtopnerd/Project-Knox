/**
 * Marks RepSession rows as synced based on existing RepVote data.
 *
 * After backfillRollCallSessions.ts populates RollCall.sessionId, this script
 * walks every unsynced RepSession, counts existing RepVote rows for that session,
 * and marks the session synced with an accurate voteCount.
 *
 * No external API calls — pure DB work. Completes in minutes.
 *
 * Run AFTER backfillRollCallSessions.ts:
 *   npx tsx src/scripts/backfillRollCallSessions.ts
 *   npx tsx src/scripts/markRepSessionsSynced.ts
 *
 * Options:
 *   YEAR_CUTOFF=2021   only process sessions from yearStart >= this year (default: 2021)
 *   MIN_VOTES=0        only mark synced if voteCount >= this (default: 0, marks even 0-vote sessions)
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'

const YEAR_CUTOFF = parseInt(process.env.YEAR_CUTOFF ?? '2021', 10)
const MIN_VOTES = parseInt(process.env.MIN_VOTES ?? '1', 10)
const BATCH = 200

async function main() {
  const total = await prisma.repSession.count({
    where: { syncedAt: null, yearStart: { gte: YEAR_CUTOFF } },
  })
  console.log(`[MarkRepSessionsSynced] ${total} unsynced RepSession rows from ${YEAR_CUTOFF}+`)

  let marked = 0
  let empty = 0
  let processed = 0

  // Process in batches to avoid loading everything into memory
  let cursor: string | undefined

  while (true) {
    const sessions = await prisma.repSession.findMany({
      where: { syncedAt: null, yearStart: { gte: YEAR_CUTOFF } },
      select: { id: true, representativeId: true, sessionId: true, yearStart: true, yearEnd: true, sessionTitle: true },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    })

    if (!sessions.length) break
    cursor = sessions[sessions.length - 1].id

    for (const session of sessions) {
      const voteCount = await prisma.repVote.count({
        where: {
          representativeId: session.representativeId,
          rollCall: { sessionId: session.sessionId },
        },
      })

      if (voteCount >= MIN_VOTES) {
        await prisma.repSession.update({
          where: { id: session.id },
          data: { syncedAt: new Date(), voteCount },
        })
        if (voteCount > 0) marked++
        else empty++
      }
    }

    processed += sessions.length
    console.log(
      `[MarkRepSessionsSynced] ${processed}/${total} processed — ${marked} marked with votes, ${empty} marked empty`,
    )
  }

  console.log(
    `[MarkRepSessionsSynced] Done — ${marked} sessions with votes, ${empty} marked as synced with 0 votes`,
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
