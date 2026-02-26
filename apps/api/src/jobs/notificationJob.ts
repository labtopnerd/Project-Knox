/**
 * Notification Job — sends email alerts to users about:
 * 1. New bills from their representatives (introduced in the last day)
 * 2. Bill status changes (passed, signed, failed, vetoed)
 *
 * Run manually: tsx src/jobs/notificationJob.ts
 * Scheduled: called from the cron in src/index.ts after each bill sync.
 */

import { prisma } from '../lib/prisma'
import { sendNewBillsEmail, sendBillStatusEmail } from '../services/notifications/email.service'
import { sendPushToUsers } from '../services/notifications/push.service'

const CONCURRENCY = 5 // Max parallel email sends

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  limit: number,
): Promise<void> {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += limit) {
    chunks.push(items.slice(i, i + limit))
  }
  for (const chunk of chunks) {
    await Promise.all(chunk.map(fn))
  }
}

/**
 * Notify users about new bills from their representatives.
 * Checks for bills introduced in the last `lookbackHours` hours.
 */
export async function notifyNewBills(lookbackHours: number = 24): Promise<{ notified: number; errors: number }> {
  const since = new Date()
  since.setHours(since.getHours() - lookbackHours)

  // Find new bills (created since last run)
  const newBills = await prisma.bill.findMany({
    where: { createdAt: { gte: since } },
    include: {
      sponsor: { select: { id: true, fullName: true, chamber: true } },
      cosponsors: {
        include: { representative: { select: { id: true } } },
      },
    },
  })

  if (newBills.length === 0) {
    console.log('[NotificationJob] No new bills to notify about')
    return { notified: 0, errors: 0 }
  }

  // Build a map from representative ID → new bills
  const repToBills = new Map<string, typeof newBills>()
  for (const bill of newBills) {
    if (bill.sponsorId) {
      if (!repToBills.has(bill.sponsorId)) repToBills.set(bill.sponsorId, [])
      repToBills.get(bill.sponsorId)!.push(bill)
    }
    for (const cs of bill.cosponsors) {
      const rid = cs.representativeId
      if (!repToBills.has(rid)) repToBills.set(rid, [])
      repToBills.get(rid)!.push(bill)
    }
  }

  const repIds = [...repToBills.keys()]
  if (repIds.length === 0) return { notified: 0, errors: 0 }

  // Find users who follow these representatives and have email notifications on
  const userReps = await prisma.userRepresentative.findMany({
    where: { representativeId: { in: repIds } },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          profile: { select: { notificationNewBills: true, notificationEmail: true } },
        },
      },
    },
  })

  // Deduplicate by user and aggregate their relevant bills
  const userBillsMap = new Map<string, { user: typeof userReps[0]['user']; billIds: Set<string> }>()
  for (const ur of userReps) {
    const { user } = ur
    if (!user.email) continue
    if (!user.profile?.notificationNewBills) continue
    if (!user.profile?.notificationEmail) continue

    const bills = repToBills.get(ur.representativeId) ?? []
    if (!userBillsMap.has(user.id)) {
      userBillsMap.set(user.id, { user, billIds: new Set() })
    }
    for (const b of bills) {
      userBillsMap.get(user.id)!.billIds.add(b.id)
    }
  }

  const billById = new Map(newBills.map((b) => [b.id, b]))
  const entries = [...userBillsMap.values()]

  let notified = 0
  let errors = 0

  await runWithConcurrency(entries, async ({ user, billIds }) => {
    try {
      const bills = [...billIds]
        .map((id) => billById.get(id))
        .filter(Boolean)
        .map((b) => ({
          id: b!.id,
          billNumber: b!.billNumber,
          title: b!.title,
          repName: b!.sponsor?.fullName ?? 'Unknown',
          chamber: b!.chamber ?? b!.level,
          status: b!.status,
        }))

      if (bills.length === 0) return

      // Send email notification
      await sendNewBillsEmail({
        to: user.email!,
        userName: user.name ?? '',
        bills,
      })

      // Send push notification (non-blocking; service handles missing tokens)
      const repName = bills[0]?.repName ?? 'your representative'
      await sendPushToUsers([user.id], {
        title: '📋 New bill from your rep',
        body: `${bills.length === 1 ? bills[0]?.title ?? 'A new bill' : `${bills.length} new bills`} from ${repName}`,
        data: { type: 'new_bill', billId: bills[0]?.id },
      })

      notified++

      // Record notification events
      await prisma.notificationEvent.createMany({
        data: bills.map((b) => ({
          userId: user.id,
          type: 'new_bill',
          billId: b.id,
          sentAt: new Date(),
        })),
        skipDuplicates: true,
      })
    } catch (err) {
      console.error(`[NotificationJob] Error notifying user ${user.id}:`, err)
      errors++
    }
  }, CONCURRENCY)

  console.log(`[NotificationJob] New-bills notifications: ${notified} users notified, ${errors} errors`)
  return { notified, errors }
}

/**
 * Detect status changes by comparing current DB status to the rawData.previousStatus field.
 * Called after a bill sync when status may have changed.
 */
export async function notifyBillStatusChanges(): Promise<{ notified: number; errors: number }> {
  // Find bills that have a recorded status change in the last 24 hours
  const since = new Date()
  since.setHours(since.getHours() - 24)

  // We track changes via NotificationEvent. Only notify users who haven't been
  // notified about this bill's current status yet.
  const recentStatusBills = await prisma.bill.findMany({
    where: {
      updatedAt: { gte: since },
      status: { in: ['passed', 'signed', 'failed', 'vetoed', 'passed_chamber', 'floor'] },
    },
    select: {
      id: true,
      billNumber: true,
      title: true,
      status: true,
      sponsorId: true,
      cosponsors: { select: { representativeId: true } },
    },
  })

  if (recentStatusBills.length === 0) {
    return { notified: 0, errors: 0 }
  }

  let notified = 0
  let errors = 0

  for (const bill of recentStatusBills) {
    const repIds = [
      ...(bill.sponsorId ? [bill.sponsorId] : []),
      ...bill.cosponsors.map((c) => c.representativeId),
    ]

    const userReps = await prisma.userRepresentative.findMany({
      where: { representativeId: { in: repIds } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profile: { select: { notificationBillUpdates: true, notificationEmail: true } },
          },
        },
      },
    })

    for (const ur of userReps) {
      const { user } = ur
      if (!user.email || !user.profile?.notificationBillUpdates || !user.profile?.notificationEmail) continue

      // Don't double-notify for the same bill + status combination
      const alreadyNotified = await prisma.notificationEvent.findFirst({
        where: {
          userId: user.id,
          billId: bill.id,
          type: 'bill_status_change',
          payload: { equals: { status: bill.status } },
        },
      })
      if (alreadyNotified) continue

      try {
        await sendBillStatusEmail({
          to: user.email,
          userName: user.name ?? '',
          billId: bill.id,
          billNumber: bill.billNumber,
          billTitle: bill.title,
          oldStatus: 'introduced',
          newStatus: bill.status,
        })

        const statusLabel = bill.status.replace(/_/g, ' ')
        await sendPushToUsers([user.id], {
          title: '📊 Bill status update',
          body: `${bill.billNumber ? `${bill.billNumber}: ` : ''}${bill.title.slice(0, 80)} — ${statusLabel}`,
          data: { type: 'bill_status_change', billId: bill.id, status: bill.status },
        })

        await prisma.notificationEvent.create({
          data: {
            userId: user.id,
            type: 'bill_status_change',
            billId: bill.id,
            payload: { status: bill.status },
            sentAt: new Date(),
          },
        })

        notified++
      } catch (err) {
        console.error(`[NotificationJob] Error on status-change notification for user ${user.id}:`, err)
        errors++
      }
    }
  }

  console.log(`[NotificationJob] Status-change notifications: ${notified} sent, ${errors} errors`)
  return { notified, errors }
}

/**
 * Run both notification types.
 */
export async function runNotificationJob(): Promise<void> {
  console.log('[NotificationJob] === Starting notification job ===')
  const [newBillsResult, statusResult] = await Promise.all([
    notifyNewBills(24),
    notifyBillStatusChanges(),
  ])
  console.log('[NotificationJob] === Complete ===', { newBills: newBillsResult, statusChanges: statusResult })
}

if (require.main === module) {
  runNotificationJob()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[NotificationJob] Fatal error:', err)
      process.exit(1)
    })
}
