/**
 * Sync cosponsored bills for all federal representatives.
 * Populates BillCosponsor table so rep pages can show bills they've cosponsored.
 * Scheduled daily; also exportable for use by the cron scheduler.
 */

import { prisma } from '../lib/prisma'
import { getSponsoredList } from '../services/legiscan/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function syncAllCosponsors(): Promise<{ linked: number; reps: number }> {
  // Only federal reps with a legiscan: externalId have cosponsorship data
  const reps = await prisma.representative.findMany({
    where: {
      source: 'congress',
      isActive: true,
      externalId: { startsWith: 'legiscan:' },
    },
    select: { id: true, externalId: true, fullName: true },
  })

  console.log(`[CosponsorSync] Syncing cosponsors for ${reps.length} federal reps`)
  let totalLinked = 0
  let repsDone = 0

  for (const rep of reps) {
    const peopleId = parseInt(rep.externalId.replace('legiscan:', ''), 10)
    if (isNaN(peopleId)) {
      console.warn(`[CosponsorSync] Invalid externalId: ${rep.externalId}`)
      repsDone++
      continue
    }

    try {
      const sponsoredBills = await getSponsoredList(peopleId)

      for (const sponsoredBill of sponsoredBills) {
        try {
          const dbBill = await prisma.bill.findFirst({
            where: {
              rawData: { path: ['bill_id'], equals: sponsoredBill.bill_id },
              level: 'federal',
            },
            select: { id: true },
          })

          if (!dbBill) continue

          await prisma.billCosponsor.upsert({
            where: { billId_representativeId: { billId: dbBill.id, representativeId: rep.id } },
            create: { billId: dbBill.id, representativeId: rep.id, joinedAt: null },
            update: {},
          })
          totalLinked++
        } catch {}
      }
    } catch (err) {
      console.warn(`[CosponsorSync] Failed for ${rep.fullName}:`, err instanceof Error ? err.message : err)
    }

    repsDone++
    if (repsDone % 10 === 0) {
      console.log(`[CosponsorSync] ${repsDone}/${reps.length} reps done, ${totalLinked} links so far`)
    }
    await sleep(250)
  }

  console.log(`[CosponsorSync] Done: ${totalLinked} cosponsor links across ${reps.length} reps`)
  return { linked: totalLinked, reps: reps.length }
}

// Allow running directly: tsx src/jobs/syncCosponsors.ts
if (require.main === module) {
  syncAllCosponsors()
    .then((result) => {
      console.log('[CosponsorSync] Result:', result)
      process.exit(0)
    })
    .catch((err) => {
      console.error('[CosponsorSync] Fatal:', err)
      process.exit(1)
    })
}
