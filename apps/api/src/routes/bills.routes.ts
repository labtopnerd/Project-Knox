/**
 * Bills API routes
 * GET /api/bills — list bills with filtering and pagination
 * GET /api/bills/trending — most-voted bills in the last 7 days
 * GET /api/bills/:id — bill detail with user vote and aggregates
 * POST /api/bills/:id/vote — submit or update a vote
 * DELETE /api/bills/:id/vote — remove a vote
 */

import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, optionalAuth, type AuthRequest } from '../middleware/auth.middleware'
import { cacheDelete } from '../lib/redis'
import { enrichBill } from '../services/ai/groq'
import type { Prisma } from '@prisma/client'

export const billsRouter = Router()

const voteSchema = z.object({
  position: z.enum(['support', 'oppose', 'neutral']),
})

// ─── GET /api/bills ────────────────────────────────────────────────────────────

billsRouter.get('/', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    level,
    stateCode,
    chamber,
    status,
    tags,
    repId,
    search,
    page = '1',
    limit = '20',
    forUser,
  } = req.query as Record<string, string>

  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20))
  const offset = (pageNum - 1) * limitNum

  // Build WHERE clause
  const where: Record<string, unknown> = {}
  if (level && level !== 'all') where.level = level
  if (stateCode) where.stateCode = stateCode.toUpperCase()
  if (chamber && chamber !== 'all') where.chamber = chamber
  if (status && status !== 'all') where.status = status
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean)
    if (tagList.length > 0) where.issueTags = { hasSome: tagList }
  }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
      { billNumber: { contains: search, mode: 'insensitive' } },
    ]
  }
  if (repId) {
    where.OR = [
      { sponsorId: repId },
      { cosponsors: { some: { representativeId: repId } } },
    ]
  }

  // Filter to bills relevant to the user when forUser=true:
  // federal bills + bills from the user's state + bills sponsored by their reps
  if (forUser === 'true' && req.userId) {
    const [userReps, userProfile] = await Promise.all([
      prisma.userRepresentative.findMany({
        where: { userId: req.userId },
        select: { representativeId: true },
      }),
      prisma.userProfile.findUnique({
        where: { id: req.userId },
        select: { stateCode: true },
      }),
    ])
    const repIds = userReps.map((ur) => ur.representativeId)

    const orClauses: Record<string, unknown>[] = [{ level: 'federal' }]
    if (userProfile?.stateCode) {
      orClauses.push({ stateCode: userProfile.stateCode })
    }
    if (repIds.length > 0) {
      orClauses.push({ sponsorId: { in: repIds } })
      orClauses.push({ cosponsors: { some: { representativeId: { in: repIds } } } })
    }
    where.OR = orClauses
  }

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      orderBy: { lastActionDate: 'desc' },
      skip: offset,
      take: limitNum,
      include: {
        aggregates: true,
        sponsor: {
          select: { id: true, fullName: true, party: true, stateCode: true, chamber: true },
        },
      },
    }),
    prisma.bill.count({ where }),
  ])

  // Fetch user votes for these bills if authenticated
  let userVotes: Record<string, string> = {}
  if (req.userId && bills.length > 0) {
    const votes = await prisma.userVote.findMany({
      where: { userId: req.userId, billId: { in: bills.map((b) => b.id) } },
      select: { billId: true, vote: true },
    })
    userVotes = Object.fromEntries(votes.map((v) => [v.billId, v.vote]))
  }

  const billsWithVotes = bills.map((bill) => ({
    ...bill,
    userVote: userVotes[bill.id] ?? null,
    aggregates: bill.aggregates
      ? {
          ...bill.aggregates,
          supportPercent: bill.aggregates.totalCount
            ? Math.round((bill.aggregates.supportCount / bill.aggregates.totalCount) * 100)
            : 0,
          opposePercent: bill.aggregates.totalCount
            ? Math.round((bill.aggregates.opposeCount / bill.aggregates.totalCount) * 100)
            : 0,
          neutralPercent: bill.aggregates.totalCount
            ? Math.round((bill.aggregates.neutralCount / bill.aggregates.totalCount) * 100)
            : 0,
        }
      : null,
  }))

  res.json({
    bills: billsWithVotes,
    total,
    page: pageNum,
    limit: limitNum,
    hasMore: offset + limitNum < total,
  })
})

// ─── GET /api/bills/trending ──────────────────────────────────────────────────

billsRouter.get('/trending', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const since = new Date()
  since.setDate(since.getDate() - 7)

  // Find bills with the most votes in the last 7 days
  const trending = await prisma.userVote.groupBy({
    by: ['billId'],
    where: { createdAt: { gte: since } },
    _count: { billId: true },
    orderBy: { _count: { billId: 'desc' } },
    take: 10,
  })

  const billIds = trending.map((t) => t.billId)
  const bills = await prisma.bill.findMany({
    where: { id: { in: billIds } },
    include: { aggregates: true },
  })

  // Preserve trending order
  const ordered = billIds
    .map((id) => bills.find((b) => b.id === id))
    .filter(Boolean)

  res.json({ bills: ordered })
})

// ─── GET /api/bills/:id ────────────────────────────────────────────────────────

billsRouter.get('/:id', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const bill = await prisma.bill.findUnique({
    where: { id: req.params.id },
    include: {
      aggregates: true,
      sponsor: {
        select: { id: true, fullName: true, party: true, stateCode: true, chamber: true, photoUrl: true },
      },
      cosponsors: {
        include: {
          representative: {
            select: { id: true, fullName: true, party: true, stateCode: true },
          },
        },
        take: 20,
      },
    },
  })

  if (!bill) {
    res.status(404).json({ error: 'Not Found', message: 'Bill not found' })
    return
  }

  let userVote: string | null = null
  let isBookmarked = false
  if (req.userId) {
    const [vote, bookmark] = await Promise.all([
      prisma.userVote.findUnique({
        where: { userId_billId: { userId: req.userId, billId: bill.id } },
        select: { vote: true },
      }),
      prisma.billBookmark.findUnique({
        where: { userId_billId: { userId: req.userId, billId: bill.id } },
        select: { userId: true },
      }),
    ])
    userVote = vote?.vote ?? null
    isBookmarked = !!bookmark
  }

  res.json({
    ...bill,
    userVote,
    isBookmarked,
    aggregates: bill.aggregates
      ? {
          ...bill.aggregates,
          supportPercent: bill.aggregates.totalCount
            ? Math.round((bill.aggregates.supportCount / bill.aggregates.totalCount) * 100)
            : 0,
          opposePercent: bill.aggregates.totalCount
            ? Math.round((bill.aggregates.opposeCount / bill.aggregates.totalCount) * 100)
            : 0,
          neutralPercent: bill.aggregates.totalCount
            ? Math.round((bill.aggregates.neutralCount / bill.aggregates.totalCount) * 100)
            : 0,
        }
      : null,
  })
})

// ─── POST /api/bills/:id/vote ─────────────────────────────────────────────────

billsRouter.post('/:id/vote', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = voteSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', message: parsed.error.errors })
    return
  }

  const { position } = parsed.data
  const billId = req.params.id
  const userId = req.userId!

  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { id: true } })
  if (!bill) {
    res.status(404).json({ error: 'Not Found', message: 'Bill not found' })
    return
  }

  // Get current vote and user's state to determine deltas
  const [existing, userProfile] = await Promise.all([
    prisma.userVote.findUnique({ where: { userId_billId: { userId, billId } } }),
    prisma.userProfile.findUnique({ where: { id: userId }, select: { stateCode: true } }),
  ])

  // Upsert the vote
  const vote = await prisma.userVote.upsert({
    where: { userId_billId: { userId, billId } },
    create: { userId, billId, vote: position },
    update: { vote: position },
  })

  // Update aggregate counts atomically (national + per-state)
  const oldVote = existing?.vote ?? null
  await updateBillAggregates(billId, oldVote, position)
  if (userProfile?.stateCode) {
    await updateBillAggregateByState(billId, userProfile.stateCode, oldVote, position)
  }

  // Get updated aggregates
  const aggregates = await prisma.billVoteAggregate.findUnique({ where: { billId } })

  // Invalidate cache
  await cacheDelete(`bills:aggregates:${billId}`)

  res.json({ vote, aggregates })
})

// ─── DELETE /api/bills/:id/vote ───────────────────────────────────────────────

billsRouter.delete('/:id/vote', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const billId = req.params.id
  const userId = req.userId!

  const [existing, userProfile] = await Promise.all([
    prisma.userVote.findUnique({ where: { userId_billId: { userId, billId } } }),
    prisma.userProfile.findUnique({ where: { id: userId }, select: { stateCode: true } }),
  ])

  if (!existing) {
    res.status(404).json({ error: 'Not Found', message: 'Vote not found' })
    return
  }

  await prisma.userVote.delete({ where: { userId_billId: { userId, billId } } })
  await updateBillAggregates(billId, existing.vote, null)
  if (userProfile?.stateCode) {
    await updateBillAggregateByState(billId, userProfile.stateCode, existing.vote, null)
  }
  await cacheDelete(`bills:aggregates:${billId}`)

  res.json({ success: true })
})

// ─── POST /api/bills/:id/bookmark ─────────────────────────────────────────────

billsRouter.post('/:id/bookmark', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const billId = req.params.id
  const userId = req.userId!

  const bill = await prisma.bill.findUnique({ where: { id: billId }, select: { id: true } })
  if (!bill) {
    res.status(404).json({ error: 'Not Found', message: 'Bill not found' })
    return
  }

  await prisma.billBookmark.upsert({
    where: { userId_billId: { userId, billId } },
    create: { userId, billId },
    update: {},
  })

  res.json({ bookmarked: true })
})

// ─── DELETE /api/bills/:id/bookmark ───────────────────────────────────────────

billsRouter.delete('/:id/bookmark', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const billId = req.params.id
  const userId = req.userId!

  await prisma.billBookmark.deleteMany({ where: { userId, billId } })
  res.json({ bookmarked: false })
})

// ─── GET /api/bills/bookmarks ─────────────────────────────────────────────────

billsRouter.get('/bookmarks/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = '1', limit = '20' } = req.query as Record<string, string>
  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20))

  const [bookmarks, total] = await Promise.all([
    prisma.billBookmark.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        bill: {
          include: {
            aggregates: true,
            sponsor: { select: { id: true, fullName: true, party: true, stateCode: true, chamber: true } },
          },
        },
      },
    }),
    prisma.billBookmark.count({ where: { userId: req.userId! } }),
  ])

  res.json({
    bills: bookmarks.map((b) => ({ ...b.bill, isBookmarked: true })),
    total,
    page: pageNum,
    limit: limitNum,
    hasMore: (pageNum - 1) * limitNum + limitNum < total,
  })
})

// ─── POST /api/bills/:id/enrich ───────────────────────────────────────────────
// On-demand AI enrichment for a single bill. No-ops if already enriched.

billsRouter.post('/:id/enrich', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const bill = await prisma.bill.findUnique({
    where: { id: req.params.id },
    include: { sponsor: { select: { fullName: true, party: true, stateCode: true } } },
  })

  if (!bill) { res.status(404).json({ error: 'Not Found' }); return }
  if (bill.aiEnrichedAt) { res.json({ already: true }); return }

  const result = await enrichBill({
    title: bill.title,
    summary: bill.summary,
    lastActionText: bill.lastActionText,
    issueTags: bill.issueTags,
    status: bill.status,
    sponsorName: bill.sponsor?.fullName,
    sponsorParty: bill.sponsor?.party ?? undefined,
    sponsorState: bill.sponsor?.stateCode ?? undefined,
  })

  if (!result) { res.status(500).json({ error: 'Enrichment failed' }); return }

  await prisma.bill.update({
    where: { id: bill.id },
    data: {
      aiSummary: result.aiSummary,
      keyProvisions: result.keyProvisions,
      whoItAffects: result.whoItAffects,
      proArguments: result.proArguments as Prisma.InputJsonValue,
      conArguments: result.conArguments as Prisma.InputJsonValue,
      aiEnrichedAt: new Date(),
    },
  })

  res.json({ enriched: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateBillAggregates(
  billId: string,
  oldVote: string | null,
  newVote: string | null,
): Promise<void> {
  // Build increment/decrement deltas
  const delta: Record<string, number> = {
    supportCount: 0,
    opposeCount: 0,
    neutralCount: 0,
    totalCount: 0,
  }

  // Decrement old vote
  if (oldVote === 'support') delta.supportCount--
  else if (oldVote === 'oppose') delta.opposeCount--
  else if (oldVote === 'neutral') delta.neutralCount--
  if (oldVote) delta.totalCount--

  // Increment new vote
  if (newVote === 'support') delta.supportCount++
  else if (newVote === 'oppose') delta.opposeCount++
  else if (newVote === 'neutral') delta.neutralCount++
  if (newVote) delta.totalCount++

  await prisma.billVoteAggregate.upsert({
    where: { billId },
    create: {
      billId,
      supportCount: Math.max(0, delta.supportCount),
      opposeCount: Math.max(0, delta.opposeCount),
      neutralCount: Math.max(0, delta.neutralCount),
      totalCount: Math.max(0, delta.totalCount),
    },
    update: {
      supportCount: { increment: delta.supportCount },
      opposeCount: { increment: delta.opposeCount },
      neutralCount: { increment: delta.neutralCount },
      totalCount: { increment: delta.totalCount },
      lastUpdatedAt: new Date(),
    },
  })
}

async function updateBillAggregateByState(
  billId: string,
  stateCode: string,
  oldVote: string | null,
  newVote: string | null,
): Promise<void> {
  const delta: Record<string, number> = {
    supportCount: 0,
    opposeCount: 0,
    neutralCount: 0,
    totalCount: 0,
  }

  if (oldVote === 'support') delta.supportCount--
  else if (oldVote === 'oppose') delta.opposeCount--
  else if (oldVote === 'neutral') delta.neutralCount--
  if (oldVote) delta.totalCount--

  if (newVote === 'support') delta.supportCount++
  else if (newVote === 'oppose') delta.opposeCount++
  else if (newVote === 'neutral') delta.neutralCount++
  if (newVote) delta.totalCount++

  await prisma.billVoteAggregateByState.upsert({
    where: { billId_stateCode: { billId, stateCode } },
    create: {
      billId,
      stateCode,
      supportCount: Math.max(0, delta.supportCount),
      opposeCount: Math.max(0, delta.opposeCount),
      neutralCount: Math.max(0, delta.neutralCount),
      totalCount: Math.max(0, delta.totalCount),
    },
    update: {
      supportCount: { increment: delta.supportCount },
      opposeCount: { increment: delta.opposeCount },
      neutralCount: { increment: delta.neutralCount },
      totalCount: { increment: delta.totalCount },
      updatedAt: new Date(),
    },
  })
}
