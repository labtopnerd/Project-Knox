/**
 * Representatives API routes
 * GET /api/representatives — list reps (filtered by user location or query params)
 * GET /api/representatives/:id — rep detail
 * POST /api/representatives/lookup — look up reps by address (triggers geocoding pipeline)
 */

import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { optionalAuth, type AuthRequest } from '../middleware/auth.middleware'
import { geocodeAddress, geocodeZipCode } from '../services/census/client'
import { getUSSessionId, getSessionPeople, getSponsoredList } from '../services/legiscan/client'
import { transformLegiScanPerson, parseStateFromDistrict, parseDistrictNumber } from '../services/legiscan/transformers'
import { getPeopleByLocation } from '../services/openstates/client'
import { transformOpenStatesPerson } from '../services/openstates/transformers'
import { getOfficialsByZip } from '../services/votesmart/client'
import { transformVoteSmartOfficial } from '../services/votesmart/transformers'
import { getQueue, type SyncRepHistoryJobData } from '../lib/queue'
import { syncRepInBackground } from '../jobs/syncRep'
import { syncRepHistoryForSession } from '../jobs/syncRepHistory'
import { cacheGet, cacheSet, TTL } from '../lib/redis'

const SYNC_COOLDOWN_HOURS = 12
const BILL_PAGE_SIZE = 10

export const representativesRouter = Router()

function extractZipFromAddress(address: string): string | null {
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/)
  return m ? m[1] : null
}

const lookupSchema = z.object({
  address: z.string().min(5).optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
}).refine((d) => d.address ?? d.zipCode, {
  message: 'Either address or zipCode is required',
})

// ─── GET /api/representatives ─────────────────────────────────────────────────

representativesRouter.get('/', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { level, stateCode, chamber, forUser } = req.query as Record<string, string>

  const where: Record<string, unknown> = { isActive: true }
  if (level && level !== 'all') where.level = level
  if (stateCode) where.stateCode = stateCode.toUpperCase()
  if (chamber && chamber !== 'all') where.chamber = chamber

  // Return only the authenticated user's representatives if forUser=true
  if (forUser === 'true' && req.userId) {
    const userReps = await prisma.userRepresentative.findMany({
      where: { userId: req.userId },
      include: {
        representative: true,
      },
    })
    res.json({ representatives: userReps.map((ur) => ur.representative) })
    return
  }

  const representatives = await prisma.representative.findMany({
    where,
    orderBy: [{ stateCode: 'asc' }, { level: 'asc' }, { fullName: 'asc' }],
    take: 100,
  })

  res.json({ representatives })
})

// ─── GET /api/representatives/:id ─────────────────────────────────────────────

representativesRouter.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    include: {
      sponsoredBills: {
        orderBy: { lastActionDate: 'desc' },
        take: 10,
        select: {
          id: true,
          billNumber: true,
          title: true,
          status: true,
          lastActionDate: true,
          chamber: true,
        },
      },
    },
  })

  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  res.json({ representative: rep })
})

// ─── GET /api/representatives/:id/votes ───────────────────────────────────────

const VALID_PAGE_SIZES = [10, 25, 50] as const

// ─── GET /api/representatives/:id/sessions ────────────────────────────────────

representativesRouter.get('/:id/sessions', async (req: AuthRequest, res: Response): Promise<void> => {
  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  const sessions = await prisma.repSession.findMany({
    where: { representativeId: req.params.id },
    orderBy: { yearStart: 'desc' },
  })

  res.json({ sessions })
})

// ─── POST /api/representatives/:id/sync-history ───────────────────────────────

representativesRouter.post('/:id/sync-history', async (req: AuthRequest, res: Response): Promise<void> => {
  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    select: { id: true, externalId: true, legiscanPeopleId: true },
  })
  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  // Resolve LegiScan people_id from either source
  let peopleId: number
  if (rep.externalId.startsWith('legiscan:')) {
    peopleId = parseInt(rep.externalId.replace('legiscan:', ''), 10)
  } else if (rep.legiscanPeopleId != null) {
    peopleId = rep.legiscanPeopleId
  } else {
    res.json({ skipped: true, reason: 'unsupported_source' })
    return
  }

  // Rate gate: once per 24 hours per rep
  const rateLimitKey = `legiscan:history-triggered:${rep.id}`
  const alreadyTriggered = await cacheGet<boolean>(rateLimitKey)
  if (alreadyTriggered) {
    res.json({ skipped: true, reason: 'rate_limited' })
    return
  }

  const unsyncedSessions = await prisma.repSession.findMany({
    where: { representativeId: rep.id, syncedAt: null },
  })

  if (unsyncedSessions.length === 0) {
    res.json({ enqueued: 0, reason: 'all_synced' })
    return
  }

  let enqueued = 0
  try {
    const queue = await getQueue()
    for (const session of unsyncedSessions) {
      const jobData: SyncRepHistoryJobData = {
        repId: rep.id,
        peopleId,
        sessionId: session.sessionId,
        yearStart: session.yearStart,
        yearEnd: session.yearEnd,
        sessionTitle: session.sessionTitle,
      }
      await queue.sendOnce(
        'sync-rep-history',
        jobData,
        { key: `${rep.id}:${session.sessionId}`, retryLimit: 3, retryDelay: 120, expireInHours: 48 },
      )
      enqueued++
    }
    await cacheSet(rateLimitKey, true, TTL.HISTORY_TRIGGER)
    res.status(202).json({ enqueued })
  } catch {
    // Queue unavailable — fall back to direct async execution for the first session
    console.warn(`[RepHistory] Queue unavailable for rep ${rep.id} — running first session directly`)
    await cacheSet(rateLimitKey, true, TTL.HISTORY_TRIGGER)
    res.status(202).json({ enqueued: 0, fallback: true })
    const first = unsyncedSessions[0]
    syncRepHistoryForSession(rep.id, peopleId, first.sessionId, first.yearStart, first.yearEnd, first.sessionTitle)
      .catch((err) => console.error(`[RepHistory] Fallback sync failed for rep ${rep.id}:`, err))
  }
})

representativesRouter.get('/:id/votes', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10))
  const requestedSize = parseInt((req.query.pageSize as string) ?? '10', 10)
  const pageSize = (VALID_PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : 10
  const sessionIdParam = req.query.sessionId ? parseInt(req.query.sessionId as string, 10) : undefined
  const skip = (page - 1) * pageSize

  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })

  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  const voteWhere = {
    representativeId: req.params.id,
    ...(sessionIdParam ? { rollCall: { sessionId: sessionIdParam } } : {}),
  }

  const [total, repVotes] = await Promise.all([
    prisma.repVote.count({ where: voteWhere }),
    prisma.repVote.findMany({
      where: voteWhere,
      orderBy: { rollCall: { date: 'desc' } },
      skip,
      take: pageSize,
      include: {
        rollCall: {
          include: {
            bill: {
              select: { id: true, billNumber: true, title: true, status: true },
            },
          },
        },
      },
    }),
  ])

  res.json({
    votes: repVotes.map((rv) => ({
      id: rv.id,
      voteText: rv.voteText,
      rollCall: {
        rollCallId: rv.rollCall.rollCallId,
        date: rv.rollCall.date,
        description: rv.rollCall.description,
        yea: rv.rollCall.yea,
        nay: rv.rollCall.nay,
        nv: rv.rollCall.nv,
        absent: rv.rollCall.absent,
        total: rv.rollCall.total,
        passed: rv.rollCall.passed,
        chamber: rv.rollCall.chamber,
        sessionId: rv.rollCall.sessionId,
        yearStart: rv.rollCall.yearStart,
        bill: rv.rollCall.bill,
      },
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  })
})

// ─── GET /api/representatives/:id/sponsored ───────────────────────────────────

representativesRouter.get('/:id/sponsored', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10))
  const skip = (page - 1) * BILL_PAGE_SIZE

  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  const [total, bills] = await Promise.all([
    prisma.bill.count({ where: { sponsorId: req.params.id } }),
    prisma.bill.findMany({
      where: { sponsorId: req.params.id },
      orderBy: { lastActionDate: 'desc' },
      skip,
      take: BILL_PAGE_SIZE,
      select: {
        id: true,
        billNumber: true,
        title: true,
        status: true,
        chamber: true,
        stateCode: true,
        introducedDate: true,
        lastActionDate: true,
        issueTags: true,
      },
    }),
  ])

  res.json({
    bills: bills.map((b) => ({
      ...b,
      introducedDate: b.introducedDate?.toISOString() ?? null,
      lastActionDate: b.lastActionDate?.toISOString() ?? null,
    })),
    pagination: { page, pageSize: BILL_PAGE_SIZE, total, totalPages: Math.ceil(total / BILL_PAGE_SIZE) },
  })
})

// ─── GET /api/representatives/:id/cosponsored ─────────────────────────────────

representativesRouter.get('/:id/cosponsored', async (req: AuthRequest, res: Response): Promise<void> => {
  const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10))
  const skip = (page - 1) * BILL_PAGE_SIZE

  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  const [total, rows] = await Promise.all([
    prisma.billCosponsor.count({ where: { representativeId: req.params.id } }),
    prisma.billCosponsor.findMany({
      where: { representativeId: req.params.id },
      orderBy: { joinedAt: 'desc' },
      skip,
      take: BILL_PAGE_SIZE,
      select: {
        joinedAt: true,
        bill: {
          select: {
            id: true,
            billNumber: true,
            title: true,
            status: true,
            chamber: true,
            stateCode: true,
            introducedDate: true,
            lastActionDate: true,
            issueTags: true,
          },
        },
      },
    }),
  ])

  res.json({
    bills: rows.map(({ bill, joinedAt }) => ({
      ...bill,
      joinedAt: joinedAt?.toISOString() ?? null,
      introducedDate: bill.introducedDate?.toISOString() ?? null,
      lastActionDate: bill.lastActionDate?.toISOString() ?? null,
    })),
    pagination: { page, pageSize: BILL_PAGE_SIZE, total, totalPages: Math.ceil(total / BILL_PAGE_SIZE) },
  })
})

// ─── POST /api/representatives/:id/sync ───────────────────────────────────────

representativesRouter.post('/:id/sync', async (req: AuthRequest, res: Response): Promise<void> => {
  const rep = await prisma.representative.findUnique({
    where: { id: req.params.id },
    select: { id: true, externalId: true, legiscanPeopleId: true, lastSyncedAt: true },
  })
  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  // Skip if synced recently
  if (rep.lastSyncedAt) {
    const hoursSince = (Date.now() - rep.lastSyncedAt.getTime()) / (1000 * 60 * 60)
    if (hoursSince < SYNC_COOLDOWN_HOURS) {
      res.json({ skipped: true, reason: 'recent', lastSyncedAt: rep.lastSyncedAt })
      return
    }
  }

  // Resolve LegiScan people_id from either source
  let peopleId: number
  if (rep.externalId.startsWith('legiscan:')) {
    const parsed = parseInt(rep.externalId.replace('legiscan:', ''), 10)
    if (isNaN(parsed)) {
      res.status(400).json({ error: 'Invalid externalId' })
      return
    }
    peopleId = parsed
  } else if (rep.legiscanPeopleId != null) {
    peopleId = rep.legiscanPeopleId
  } else {
    res.json({ skipped: true, reason: 'unsupported_source' })
    return
  }

  // Mark sync as started immediately so syncPending clears on next page load
  await prisma.representative.update({
    where: { id: rep.id },
    data: { lastSyncedAt: new Date() },
  })

  // Enqueue via pg-boss — deduped by repId, retries 3x on failure
  try {
    const queue = await getQueue()
    await queue.sendOnce('sync-rep', { repId: rep.id, peopleId }, {
      retryLimit: 3,
      retryDelay: 60,
      expireInHours: 24,
    })
    res.status(202).json({ started: true })
  } catch {
    // Fallback to fire-and-forget if queue unavailable
    res.status(202).json({ started: true })
    syncRepInBackground(rep.id, peopleId).catch((err) => {
      console.error(`[RepSync] Background sync failed for rep ${rep.id}:`, err)
    })
  }
})

// ─── POST /api/representatives/lookup ─────────────────────────────────────────
// Geocode an address and return all representatives for that location.
// Also saves them to the authenticated user's profile if they are logged in.

representativesRouter.post('/lookup', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = lookupSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', message: parsed.error.errors })
    return
  }

  const { address, zipCode } = parsed.data

  // Step 1: Geocode
  let geoResult: Awaited<ReturnType<typeof geocodeAddress>> = null

  if (address) {
    geoResult = await geocodeAddress(address)
  }
  if (!geoResult && zipCode) {
    const zipResult = await geocodeZipCode(zipCode)
    if (zipResult) {
      geoResult = {
        latitude: zipResult.latitude ?? 0,
        longitude: zipResult.longitude ?? 0,
        stateCode: zipResult.stateCode ?? '',
        stateFips: zipResult.stateFips ?? '',
        countyFips: '',
        tractCode: '',
        blockCode: '',
        congressionalDistrict: '',
        stateDistrict: '',
        stateDistrictLower: '',
        matchedAddress: zipResult.matchedAddress ?? '',
      }
    }
  }

  if (!geoResult || !geoResult.stateCode) {
    res.status(422).json({ error: 'Geocoding failed', message: 'Could not determine location from the provided address' })
    return
  }

  const repsFound: string[] = [] // IDs of upserted representatives

  // Step 2 & 3: Fetch federal senators + house rep from LegiScan
  try {
    const sessionId = await getUSSessionId(119)
    const allPeople = sessionId ? (await getSessionPeople(sessionId)) : []

    // Senators: role_id === 2, match stateCode
    const senators = allPeople
      .filter((p) => p.role_id === 2 && parseStateFromDistrict(p.district) === geoResult!.stateCode)
      .slice(0, 2)

    for (const person of senators) {
      const data = transformLegiScanPerson(person)
      const rep = await prisma.representative.upsert({
        where: { externalId: data.externalId },
        create: data,
        update: {
          fullName: data.fullName,
          party: data.party,
          isActive: true,
          lastSyncedAt: new Date(),
        },
      })
      repsFound.push(rep.id)
    }

    // House rep: role_id === 1, match stateCode + district number
    if (geoResult.congressionalDistrict) {
      const houseReps = allPeople
        .filter(
          (p) =>
            p.role_id === 1 &&
            parseStateFromDistrict(p.district) === geoResult!.stateCode &&
            parseDistrictNumber(p.district) === geoResult!.congressionalDistrict,
        )
        .slice(0, 1)

      for (const person of houseReps) {
        const data = transformLegiScanPerson(person)
        const rep = await prisma.representative.upsert({
          where: { externalId: data.externalId },
          create: data,
          update: {
            fullName: data.fullName,
            party: data.party,
            isActive: true,
            lastSyncedAt: new Date(),
          },
        })
        repsFound.push(rep.id)
      }
    }
  } catch (err) {
    console.error('[RepLookup] Error fetching federal reps from LegiScan:', err)
  }

  // Step 4: Fetch state legislators via OpenStates geolocation
  if (geoResult.latitude && geoResult.longitude) {
    try {
      const stateLegsResponse = await getPeopleByLocation(geoResult.latitude, geoResult.longitude)
      // Filter to state-level legislators only — federal reps are already handled by LegiScan above.
      // OpenStates jurisdiction IDs include "/state:" for state governments; federal omits it.
      const stateLegislators = stateLegsResponse.results.filter((p) =>
        p.jurisdiction.id.includes('/state:'),
      )
      for (const person of stateLegislators) {
        const data = transformOpenStatesPerson(person)
        const rep = await prisma.representative.upsert({
          where: { externalId: data.externalId },
          create: data,
          update: {
            fullName: data.fullName,
            party: data.party,
            photoUrl: data.photoUrl,
            isActive: data.isActive,
            lastSyncedAt: data.lastSyncedAt,
          },
        })
        repsFound.push(rep.id)
      }
    } catch (err) {
      console.error('[RepLookup] Error fetching state legislators:', err)
    }
  }

  // Step 5: Fetch local officials via VoteSmart
  if (process.env.VOTESMART_API_KEY) {
    try {
      const zipForLocal =
        extractZipFromAddress(geoResult.matchedAddress ?? '') ?? zipCode ?? null

      if (zipForLocal) {
        const localOfficials = await getOfficialsByZip(zipForLocal)
        for (const official of localOfficials) {
          const data = transformVoteSmartOfficial(official, geoResult.stateCode)
          const rep = await prisma.representative.upsert({
            where: { externalId: data.externalId },
            create: data,
            update: {
              title: data.title,
              phone: data.phone,
              email: data.email,
              websiteUrl: data.websiteUrl,
              photoUrl: data.photoUrl,
              lastSyncedAt: data.lastSyncedAt,
            },
          })
          repsFound.push(rep.id)
        }
      }
    } catch (err) {
      console.error('[RepLookup] Error fetching local officials from VoteSmart:', err)
    }
  }

  // Step 6: If user is authenticated, update their profile and rep associations
  if (req.userId) {
    await prisma.userProfile.upsert({
      where: { id: req.userId },
      create: {
        id: req.userId,
        stateCode: geoResult.stateCode,
        latitude: geoResult.latitude,
        longitude: geoResult.longitude,
        fedDistrict: geoResult.congressionalDistrict
          ? `${geoResult.stateCode}-${geoResult.congressionalDistrict}`
          : null,
        stateDistrict: geoResult.stateDistrict || null,
        addressLine1: geoResult.matchedAddress || address || null,
        zipCode: zipCode ?? null,
      },
      update: {
        stateCode: geoResult.stateCode,
        latitude: geoResult.latitude,
        longitude: geoResult.longitude,
        fedDistrict: geoResult.congressionalDistrict
          ? `${geoResult.stateCode}-${geoResult.congressionalDistrict}`
          : null,
        stateDistrict: geoResult.stateDistrict || null,
        addressLine1: geoResult.matchedAddress || address || null,
        ...(zipCode ? { zipCode } : {}),
      },
    })

    // Replace user's representative associations
    await prisma.userRepresentative.deleteMany({ where: { userId: req.userId } })
    if (repsFound.length > 0) {
      await prisma.userRepresentative.createMany({
        data: repsFound.map((repId) => ({ userId: req.userId!, representativeId: repId })),
        skipDuplicates: true,
      })
    }
  }

  const representatives = await prisma.representative.findMany({
    where: { id: { in: repsFound } },
    orderBy: [{ level: 'asc' }, { chamber: 'asc' }],
  })

  res.json({
    location: {
      stateCode: geoResult.stateCode,
      congressionalDistrict: geoResult.congressionalDistrict,
      matchedAddress: geoResult.matchedAddress,
    },
    representatives,
  })
})
