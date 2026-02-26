/**
 * Contact Representative routes
 * POST /api/contact/:repId — log a contact attempt (email, form, phone note)
 */

import { Router, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, type AuthRequest } from '../middleware/auth.middleware'

export const contactRouter = Router()

const contactSchema = z.object({
  billId: z.string().optional(),
  channel: z.enum(['email', 'form', 'phone_note']),
  subject: z.string().max(300).optional(),
  body: z.string().min(10).max(5000),
})

// POST /api/contact/:repId
contactRouter.post('/:repId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = contactSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', message: parsed.error.errors })
    return
  }

  const { billId, channel, subject, body } = parsed.data
  const representativeId = req.params.repId

  const rep = await prisma.representative.findUnique({
    where: { id: representativeId },
    select: { id: true, fullName: true, email: true, contactFormUrl: true },
  })

  if (!rep) {
    res.status(404).json({ error: 'Not Found', message: 'Representative not found' })
    return
  }

  // Log the message
  const message = await prisma.sentMessage.create({
    data: {
      userId: req.userId!,
      representativeId,
      billId: billId ?? null,
      channel,
      subject: subject ?? null,
      body,
      status: 'sent',
    },
  })

  res.status(201).json({
    message,
    representative: {
      fullName: rep.fullName,
      email: rep.email,
      contactFormUrl: rep.contactFormUrl,
    },
    note:
      channel === 'form'
        ? 'Message logged. Please use the contact form URL to submit your message directly.'
        : channel === 'email' && rep.email
        ? `Message logged. You can send to ${rep.email}`
        : 'Message logged.',
  })
})
