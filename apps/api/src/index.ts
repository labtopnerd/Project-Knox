/**
 * Project Knox — Express API Server
 *
 * Serves the mobile app and acts as a proxy for external civic data APIs.
 * The Next.js web app uses this API via Next.js Route Handlers.
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cron from 'node-cron'

import { authRouter } from './routes/auth.routes'
import { billsRouter } from './routes/bills.routes'
import { representativesRouter } from './routes/representatives.routes'
import { usersRouter } from './routes/users.routes'
import { contactRouter } from './routes/contact.routes'
import { syncRouter } from './routes/sync.routes'
import { runFullSync } from './jobs/billSync'
import { runNotificationJob } from './jobs/notificationJob'
import { syncAllCosponsors } from './jobs/syncCosponsors'
import { getQueue, type SyncRepJobData, type SyncRepHistoryJobData } from './lib/queue'
import { syncRepInBackground } from './jobs/syncRep'
import { syncRepHistoryForSession } from './jobs/syncRepHistory'
import { pollCongressRss } from './jobs/rssPoller'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

// ─── Security middleware ───────────────────────────────────────────────────────

app.use(helmet())

app.use(
  cors({
    origin: [
      process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'exp://localhost:8081', // Expo dev
    ].filter(Boolean),
    credentials: true,
  }),
)

// Global rate limit: 300 requests per 15 minutes per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
)

app.use(express.json({ limit: '1mb' }))

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter)
app.use('/api/bills', billsRouter)
app.use('/api/representatives', representativesRouter)
app.use('/api/users', usersRouter)
app.use('/api/contact', contactRouter)
app.use('/api/sync', syncRouter)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Route not found' })
})

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err)
  res.status(500).json({ error: 'Internal Server Error', message: 'An unexpected error occurred' })
})

// ─── Scheduled Jobs ───────────────────────────────────────────────────────────

// Run full bill sync every 6 hours, then send notifications
if (process.env.ENABLE_CRON === 'true') {
  // Full bill sync + notifications every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Starting scheduled bill sync...')
    try {
      const result = await runFullSync()
      console.log('[Cron] Sync complete:', JSON.stringify(result))
    } catch (err) {
      console.error('[Cron] Sync failed:', err)
    }

    console.log('[Cron] Starting notification job...')
    try {
      await runNotificationJob()
    } catch (err) {
      console.error('[Cron] Notification job failed:', err)
    }
  })
  console.log('[Cron] Bill sync + notifications scheduled every 6 hours')

  // Daily cosponsor sync at 03:00 UTC (low-traffic window)
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Starting daily cosponsor sync...')
    try {
      const result = await syncAllCosponsors()
      console.log('[Cron] Cosponsor sync complete:', JSON.stringify(result))
    } catch (err) {
      console.error('[Cron] Cosponsor sync failed:', err)
    }
  })
  console.log('[Cron] Cosponsor sync scheduled daily at 03:00 UTC')

  // Nightly rep history backfill at 02:00 UTC — 10 reps per run (rate-limit friendly)
  cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Starting nightly rep history backfill...')
    try {
      await fetch(`http://localhost:${PORT}/api/sync/rep-history?limit=20&yearFrom=2021`, {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
      })
    } catch (err) {
      console.error('[Cron] Rep history backfill failed:', err)
    }
  })
  console.log('[Cron] Rep history backfill scheduled nightly at 02:00 UTC')

  // RSS poll every 15 minutes for near-real-time federal bill detection
  cron.schedule('*/15 * * * *', async () => {
    try {
      await pollCongressRss()
    } catch (err) {
      console.error('[Cron] RSS poll failed:', err)
    }
  })
  console.log('[Cron] Congress.gov RSS poller scheduled every 15 minutes')
}

// ─── Job Queue Workers ────────────────────────────────────────────────────────

async function startWorkers() {
  try {
    const queue = await getQueue()

    // sync-rep: fetch and store all sponsored bills + roll calls for one rep
    queue.work<SyncRepJobData>('sync-rep', { teamSize: 2 }, async (job) => {
      const { repId, peopleId } = job.data
      console.log(`[Worker] sync-rep: starting for rep ${repId}`)
      await syncRepInBackground(repId, peopleId)
      console.log(`[Worker] sync-rep: done for rep ${repId}`)
    })

    // sync-rep-history: sync one session's votes for one rep (rate-limit friendly: teamSize 1)
    queue.work<SyncRepHistoryJobData>('sync-rep-history', { teamSize: 1 }, async (job) => {
      const { repId, peopleId, sessionId, yearStart, yearEnd, sessionTitle } = job.data
      console.log(`[Worker] sync-rep-history: rep ${repId} session ${sessionId} (${sessionTitle})`)
      await syncRepHistoryForSession(repId, peopleId, sessionId, yearStart, yearEnd, sessionTitle)
      console.log(`[Worker] sync-rep-history: done rep ${repId} session ${sessionId}`)
    })

    console.log('[Queue] Workers registered: sync-rep, sync-rep-history')
  } catch (err) {
    // Queue is optional — server works without it (falls back to fire-and-forget)
    console.warn('[Queue] Could not start workers — DATABASE_URL may be missing:', err instanceof Error ? err.message : err)
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] Project Knox API running on port ${PORT}`)
  console.log(`[Server] Environment: ${process.env.NODE_ENV ?? 'development'}`)
  startWorkers()
})

export default app
