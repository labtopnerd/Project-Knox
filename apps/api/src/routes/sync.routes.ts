/**
 * Sync routes — triggered by Vercel Cron or manual invocation
 * POST /api/sync/bills — trigger bill sync
 * POST /api/sync/status — get last sync status
 *
 * These routes are protected by a CRON_SECRET header.
 */

import { Router, type Request, type Response } from 'express'
import { runFullSync, syncFederalBills, syncStateBills, backfillRollCalls } from '../jobs/billSync'
import { prisma } from '../lib/prisma'
import { getQueue, type SyncRepHistoryJobData } from '../lib/queue'

export const syncRouter = Router()

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Server misconfigured', message: 'CRON_SECRET is not set' })
      return false
    }
    return true // Allow in development without a secret
  }

  const provided = req.headers['x-cron-secret'] ?? req.headers.authorization?.replace('Bearer ', '')
  if (provided !== secret) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid cron secret' })
    return false
  }
  return true
}

// POST /api/sync/rollcalls — backfill roll calls for already-synced bills
syncRouter.post('/rollcalls', async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return

  const limit = parseInt((req.query.limit as string) ?? '50', 10)

  try {
    const result = await backfillRollCalls(limit)
    res.json({ result })
  } catch (err) {
    console.error('[SyncRoute] Roll call backfill error:', err)
    res.status(500).json({ error: 'Backfill failed', message: String(err) })
  }
})

// GET /api/sync/logs
syncRouter.get('/logs', async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return
  const { job } = req.query as Record<string, string>
  const logs = await prisma.syncLog.findMany({
    where: job ? { job } : undefined,
    orderBy: { startedAt: 'desc' },
    take: 20,
  })
  res.json({ logs })
})

// POST /api/sync/rep-history — nightly batch: enqueue unsynced sessions
// ?limit=N  — max reps to process per run (default 20, max 100)
// ?yearFrom=YYYY — only process sessions from this year forward (default 2021)
syncRouter.post('/rep-history', async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return

  const limit = Math.min(100, parseInt((req.query.limit as string) ?? '20', 10))
  const yearFrom = parseInt((req.query.yearFrom as string) ?? '2021', 10)

  // Include both legiscan: reps and state reps matched via legiscanPeopleId
  const repsWithUnsynced = await prisma.representative.findMany({
    where: {
      OR: [
        { externalId: { startsWith: 'legiscan:' } },
        { legiscanPeopleId: { not: null } },
      ],
      repSessions: { some: { syncedAt: null, yearStart: { gte: yearFrom } } },
    },
    select: {
      id: true,
      externalId: true,
      legiscanPeopleId: true,
      repSessions: { where: { syncedAt: null, yearStart: { gte: yearFrom } } },
    },
    take: limit,
  })

  let enqueued = 0
  try {
    const queue = await getQueue()
    for (const rep of repsWithUnsynced) {
      const peopleId = rep.externalId.startsWith('legiscan:')
        ? parseInt(rep.externalId.replace('legiscan:', ''), 10)
        : rep.legiscanPeopleId!

      for (const session of rep.repSessions) {
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
    }
  } catch (err) {
    console.error('[SyncRoute] rep-history enqueue error:', err)
    res.status(500).json({ error: 'Failed to enqueue', message: String(err) })
    return
  }

  res.json({ repsProcessed: repsWithUnsynced.length, enqueued })
})

// POST /api/sync/bills
syncRouter.post('/bills', async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return

  const { scope = 'full', sinceDays } = req.query as Record<string, string>
  const parsedSinceDays = sinceDays ? parseInt(sinceDays, 10) : undefined

  try {
    if (scope === 'federal') {
      const result = await syncFederalBills(119)
      res.json({ scope: 'federal', result })
    } else if (scope === 'state') {
      const result = await syncStateBills(parsedSinceDays)
      res.json({ scope: 'state', result })
    } else {
      const result = await runFullSync()
      res.json({ scope: 'full', result })
    }
  } catch (err) {
    console.error('[SyncRoute] Error:', err)
    res.status(500).json({ error: 'Sync failed', message: String(err) })
  }
})
