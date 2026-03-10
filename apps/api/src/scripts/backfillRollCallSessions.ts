/**
 * Backfills RollCall.sessionId and RollCall.yearStart from the bill's rawData.
 *
 * billSync stores the full LegiScan response in Bill.rawData, which includes
 * the session object (session_id, year_start). This script reads that data and
 * writes it back onto the RollCall rows that were created before we started
 * passing sessionMeta to syncRollCallsForBill.
 *
 * No external API calls — pure DB work.
 *
 * Run with:
 *   npx tsx src/scripts/backfillRollCallSessions.ts
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'

const BATCH = 500

async function main() {
  const total = await prisma.rollCall.count({ where: { sessionId: null } })
  console.log(`[BackfillRollCallSessions] ${total} RollCall rows missing sessionId`)

  let updated = 0
  let skipped = 0
  let offset = 0

  while (offset < total) {
    const rollCalls = await prisma.rollCall.findMany({
      where: { sessionId: null },
      select: { id: true, bill: { select: { rawData: true } } },
      take: BATCH,
      skip: offset,
    })

    if (!rollCalls.length) break

    for (const rc of rollCalls) {
      const raw = rc.bill?.rawData as Record<string, unknown> | null
      const session = raw?.session as { session_id?: number; year_start?: number } | null

      if (!session?.session_id || !session?.year_start) {
        skipped++
        continue
      }

      await prisma.rollCall.update({
        where: { id: rc.id },
        data: { sessionId: session.session_id, yearStart: session.year_start },
      })
      updated++
    }

    offset += BATCH
    console.log(`[BackfillRollCallSessions] Progress: ${Math.min(offset, total)}/${total} (${updated} updated, ${skipped} skipped)`)
  }

  console.log(`[BackfillRollCallSessions] Done — ${updated} updated, ${skipped} skipped (no session in rawData)`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
