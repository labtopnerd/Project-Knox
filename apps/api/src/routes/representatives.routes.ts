/**
 * Representatives API routes
 * GET /api/representatives — list reps (filtered by user location or query params)
 * GET /api/representatives/:id — rep detail
 * POST /api/representatives/lookup — look up reps by address (triggers geocoding pipeline)
 */

import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, optionalAuth, type AuthRequest } from '../middleware/auth.middleware'
import { geocodeAddress, geocodeZipCode } from '../services/census/client'
import { getMembers } from '../services/congress/client'
import { transformCongressMember } from '../services/congress/transformers'
import { getPeopleByLocation } from '../services/openstates/client'
import { transformOpenStatesPerson } from '../services/openstates/transformers'

export const representativesRouter = Router()

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

  // Step 2: Fetch federal senators (2 per state)
  try {
    const senatorsResponse = await getMembers({
      stateCode: geoResult.stateCode,
      chamber: 'Senate',
      currentMember: true,
    })
    for (const member of senatorsResponse.members.slice(0, 2)) {
      const data = transformCongressMember(member as Parameters<typeof transformCongressMember>[0])
      const rep = await prisma.representative.upsert({
        where: { externalId: data.externalId },
        create: data,
        update: {
          fullName: data.fullName,
          party: data.party,
          photoUrl: data.photoUrl,
          phone: data.phone,
          isActive: data.isActive,
          lastSyncedAt: data.lastSyncedAt,
        },
      })
      repsFound.push(rep.id)
    }
  } catch (err) {
    console.error('[RepLookup] Error fetching federal senators:', err)
  }

  // Step 3: Fetch House representative (by district if available)
  if (geoResult.congressionalDistrict) {
    try {
      const houseResponse = await getMembers({
        stateCode: geoResult.stateCode,
        district: parseInt(geoResult.congressionalDistrict, 10),
        chamber: 'House',
        currentMember: true,
      })
      for (const member of houseResponse.members.slice(0, 1)) {
        const data = transformCongressMember(member as Parameters<typeof transformCongressMember>[0])
        const rep = await prisma.representative.upsert({
          where: { externalId: data.externalId },
          create: data,
          update: {
            fullName: data.fullName,
            party: data.party,
            photoUrl: data.photoUrl,
            phone: data.phone,
            isActive: data.isActive,
            lastSyncedAt: data.lastSyncedAt,
          },
        })
        repsFound.push(rep.id)
      }
    } catch (err) {
      console.error('[RepLookup] Error fetching House rep:', err)
    }
  }

  // Step 4: Fetch state legislators via OpenStates geolocation
  if (geoResult.latitude && geoResult.longitude) {
    try {
      const stateLegsResponse = await getPeopleByLocation(geoResult.latitude, geoResult.longitude)
      for (const person of stateLegsResponse.results) {
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

  // Step 5: If user is authenticated, update their profile and rep associations
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
        addressLine1: address ?? null,
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
        ...(address ? { addressLine1: address } : {}),
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
