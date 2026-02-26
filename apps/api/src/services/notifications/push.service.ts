/**
 * Expo push notification service.
 *
 * Uses expo-server-sdk to send push notifications to devices registered
 * via POST /api/users/me/push-token. Gracefully no-ops when no tokens exist.
 */

import Expo, { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk'
import { prisma } from '../../lib/prisma'

const expo = new Expo()

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Send a push notification to all registered devices for the given user IDs.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return

  const deviceTokens = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { token: true },
  })

  const validTokens = deviceTokens
    .map((d) => d.token)
    .filter((t) => Expo.isExpoPushToken(t))

  if (validTokens.length === 0) return

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }))

  const chunks = expo.chunkPushNotifications(messages)
  const tickets: ExpoPushTicket[] = []

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk)
      tickets.push(...ticketChunk)
    } catch (err) {
      console.error('[PushService] Error sending notification chunk:', err)
    }
  }

  // Log any delivery errors
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error') {
      console.warn(`[PushService] Ticket error for token ${validTokens[i]}:`, ticket.message)
    }
  })
}
