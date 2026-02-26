/**
 * User profile routes
 * GET  /api/users/me — get current user profile
 * PUT  /api/users/me — update profile
 * POST /api/users/me/push-token — register Expo push token
 * GET  /api/users/me/messages — sent messages history
 * GET  /api/users/me/notifications — notifications
 * POST /api/users/me/notifications/:id/read — mark notification read
 */

import { Router, type Response } from 'express'
import { z } from 'zod'
import Expo from 'expo-server-sdk'
import { prisma } from '../lib/prisma'
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware'

export const usersRouter = Router()

// All user routes require authentication
usersRouter.use(requireAuth)

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  notificationNewBills: z.boolean().optional(),
  notificationBillUpdates: z.boolean().optional(),
  notificationEmail: z.boolean().optional(),
  notificationPush: z.boolean().optional(),
})

// GET /api/users/me
usersRouter.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      profile: true,
      _count: {
        select: { votes: true, sentMessages: true },
      },
    },
  })

  if (!user) {
    res.status(404).json({ error: 'Not Found', message: 'User not found' })
    return
  }

  res.json({ user })
})

// PUT /api/users/me
usersRouter.put('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = updateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', message: parsed.error.errors })
    return
  }

  const { name, ...profileUpdates } = parsed.data

  if (name) {
    await prisma.user.update({
      where: { id: req.userId },
      data: { name },
    })
  }

  if (Object.keys(profileUpdates).length > 0) {
    await prisma.userProfile.upsert({
      where: { id: req.userId },
      create: { id: req.userId!, ...profileUpdates },
      update: profileUpdates,
    })
  }

  res.json({ success: true })
})

// POST /api/users/me/push-token
usersRouter.post('/me/push-token', async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, platform } = req.body as { token?: string; platform?: string }

  if (!token || !Expo.isExpoPushToken(token)) {
    res.status(400).json({ error: 'Validation error', message: 'Invalid Expo push token' })
    return
  }

  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId: req.userId!, token, platform: platform ?? null },
    update: { userId: req.userId!, platform: platform ?? null },
  })

  res.json({ success: true })
})

// GET /api/users/me/messages
usersRouter.get('/me/messages', async (req: AuthRequest, res: Response): Promise<void> => {
  const { page = '1', limit = '20' } = req.query as Record<string, string>
  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20))

  const [messages, total] = await Promise.all([
    prisma.sentMessage.findMany({
      where: { userId: req.userId },
      orderBy: { sentAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: {
        representative: {
          select: { id: true, fullName: true, party: true, stateCode: true, chamber: true },
        },
        bill: {
          select: { id: true, billNumber: true, title: true },
        },
      },
    }),
    prisma.sentMessage.count({ where: { userId: req.userId } }),
  ])

  res.json({ messages, total, page: pageNum, limit: limitNum })
})

// GET /api/users/me/notifications
usersRouter.get('/me/notifications', async (req: AuthRequest, res: Response): Promise<void> => {
  const notifications = await prisma.notificationEvent.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      bill: {
        select: { id: true, billNumber: true, title: true },
      },
    },
  })

  const unreadCount = await prisma.notificationEvent.count({
    where: { userId: req.userId, readAt: null },
  })

  res.json({ notifications, unreadCount })
})

// POST /api/users/me/notifications/:id/read
usersRouter.post('/me/notifications/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  await prisma.notificationEvent.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data: { readAt: new Date() },
  })

  res.json({ success: true })
})
