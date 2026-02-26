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

// Run full bill sync every 6 hours: 0 */6 * * *
if (process.env.ENABLE_CRON === 'true') {
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Starting scheduled bill sync...')
    try {
      const result = await runFullSync()
      console.log('[Cron] Sync complete:', JSON.stringify(result))
    } catch (err) {
      console.error('[Cron] Sync failed:', err)
    }
  })
  console.log('[Cron] Bill sync scheduled every 6 hours')
}

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] Project Knox API running on port ${PORT}`)
  console.log(`[Server] Environment: ${process.env.NODE_ENV ?? 'development'}`)
})

export default app
