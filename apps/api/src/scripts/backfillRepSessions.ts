/**
 * One-time backfill script: seeds RepSession rows for all existing federal reps.
 *
 * Uses getSponsoredList to discover which sessions each rep served in,
 * then cross-references with getSessionList('US') for session metadata.
 *
 * Run after the migration:
 *   npx tsx src/scripts/backfillRepSessions.ts
 *
 * This does NOT enqueue history sync jobs — that is left to the nightly cron
 * (POST /api/sync/rep-history) or the lazy UI trigger.
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { getSponsoredList, getSessionList } from '../services/legiscan/client'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const reps = await prisma.representative.findMany({
    where: { externalId: { startsWith: 'legiscan:' } },
    select: { id: true, externalId: true, fullName: true },
  })

  console.log(`[BackfillRepSessions] Found ${reps.length} federal reps`)

  // Pre-fetch all US sessions and build a lookup map
  const allUsSessions = await getSessionList('US')
  const sessionMap = new Map(allUsSessions.map((s) => [s.session_id, s]))
  console.log(`[BackfillRepSessions] Loaded ${allUsSessions.length} US sessions`)

  let seeded = 0
  let errors = 0

  for (const rep of reps) {
    try {
      const peopleId = parseInt(rep.externalId.replace('legiscan:', ''), 10)
      const sponsoredBills = await getSponsoredList(peopleId)
      const uniqueSessionIds = [...new Set(sponsoredBills.map((b) => b.session_id))]

      let repSeeded = 0
      for (const sid of uniqueSessionIds) {
        const session = sessionMap.get(sid)
        if (!session) continue

        await prisma.repSession.upsert({
          where: { representativeId_sessionId: { representativeId: rep.id, sessionId: sid } },
          create: {
            representativeId: rep.id,
            sessionId: sid,
            yearStart: session.year_start,
            yearEnd: session.year_end,
            sessionTitle: session.session_title,
          },
          update: {},
        })
        repSeeded++
        seeded++
      }

      console.log(`[BackfillRepSessions] ${rep.fullName}: ${repSeeded} sessions seeded (${uniqueSessionIds.length} unique in sponsored list)`)
      await sleep(200) // Rate-limit courtesy
    } catch (err) {
      console.error(`[BackfillRepSessions] Error for rep ${rep.id} (${rep.fullName}):`, err)
      errors++
    }
  }

  console.log(`[BackfillRepSessions] Done — ${seeded} sessions seeded, ${errors} errors`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
