/**
 * Per-representative sync job.
 * Fetches all sponsored bills for a LegiScan representative and upserts
 * them along with cosponsor links and roll call votes.
 *
 * Called by:
 *   - pg-boss worker (sync-rep queue)
 *   - Fallback direct call if queue is unavailable
 */

import { prisma } from '../lib/prisma'
import { getSponsoredList, getBill, getSessionList } from '../services/legiscan/client'
import {
  transformLegiScanBill,
  parseStateFromDistrict,
  parseDistrictNumber,
} from '../services/legiscan/transformers'
import { syncRollCallsForBill } from '../services/legiscan/syncUtils'

const US_STATE_ID = 52 // LegiScan state_id for US Congress

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function syncRepInBackground(repId: string, peopleId: number): Promise<void> {
  const sponsoredBills = await getSponsoredList(peopleId)
  let synced = 0

  for (const sponsoredBill of sponsoredBills) {
    try {
      const bill = await getBill(sponsoredBill.bill_id)
      if (!bill) continue

      const result = transformLegiScanBill(bill, 119)
      if (!result) continue

      const { primarySponsorPeopleId, cosponsorPeopleIds, ...billData } = result

      // Upsert primary sponsor if present
      let sponsorId: string | undefined
      if (primarySponsorPeopleId != null) {
        const sponsor = bill.sponsors.find((s) => s.people_id === primarySponsorPeopleId)
        if (sponsor) {
          const sponsorStateCode = sponsor.district ? parseStateFromDistrict(sponsor.district) || null : null
          const sponsorDistrict = sponsor.district ? parseDistrictNumber(sponsor.district) : null
          const sponsorRep = await prisma.representative.upsert({
            where: { externalId: `legiscan:${primarySponsorPeopleId}` },
            create: {
              externalId: `legiscan:${primarySponsorPeopleId}`,
              source: 'congress',
              fullName: sponsor.name,
              party: sponsor.party ?? null,
              chamber: billData.chamber ?? 'house',
              level: 'federal',
              stateCode: sponsorStateCode,
              district: sponsorDistrict,
              isActive: true,
              lastSyncedAt: new Date(),
            },
            update: {
              fullName: sponsor.name,
              party: sponsor.party ?? null,
              stateCode: sponsorStateCode,
              district: sponsorDistrict,
            },
            select: { id: true },
          })
          sponsorId = sponsorRep.id
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

      // Upsert cosponsor links for reps already in DB
      for (const cosponsorPeopleId of cosponsorPeopleIds) {
        const cosponsorRep = await prisma.representative.findUnique({
          where: { externalId: `legiscan:${cosponsorPeopleId}` },
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

      // Sync roll calls
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

      synced++
    } catch (err) {
      console.error(`[RepSync] Error syncing bill ${sponsoredBill.bill_id}:`, err)
    }

    await sleep(200)
  }

  await prisma.representative.update({
    where: { id: repId },
    data: { lastSyncedAt: new Date() },
  })

  console.log(`[RepSync] Sync complete for rep ${repId}: ${synced}/${sponsoredBills.length} bills synced`)

  // Discover all sessions this rep has served in by extracting unique session_ids
  // from their sponsored bill list, then cross-referencing with US session metadata.
  // syncedAt is intentionally left null — history is populated by sync-rep-history jobs.
  try {
    const uniqueSessionIds = [...new Set(sponsoredBills.map((b) => b.session_id))]
    if (uniqueSessionIds.length > 0) {
      const allUsSessions = await getSessionList('US')
      const sessionMap = new Map(allUsSessions.map((s) => [s.session_id, s]))

      let seeded = 0
      for (const sid of uniqueSessionIds) {
        const session = sessionMap.get(sid)
        if (!session) continue
        await prisma.repSession.upsert({
          where: { representativeId_sessionId: { representativeId: repId, sessionId: sid } },
          create: {
            representativeId: repId,
            sessionId: sid,
            yearStart: session.year_start,
            yearEnd: session.year_end,
            sessionTitle: session.session_title,
          },
          update: {}, // Don't overwrite syncedAt or voteCount if already set
        })
        seeded++
      }

      if (seeded > 0) {
        console.log(`[RepSync] Seeded ${seeded} RepSession rows for rep ${repId}`)
      }
    }
  } catch (err) {
    // Session discovery is non-critical — don't fail the whole sync
    console.error(`[RepSync] Failed to seed RepSession rows for rep ${repId}:`, err)
  }
}
