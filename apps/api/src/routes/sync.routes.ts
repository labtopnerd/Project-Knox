/**
 * Sync routes — triggered by Vercel Cron or manual invocation
 * POST /api/sync/bills — trigger bill sync
 * POST /api/sync/status — get last sync status
 *
 * These routes are protected by a CRON_SECRET header.
 */

import { Router, type Request, type Response } from 'express'
import { runFullSync, syncFederalBills, syncStateBills } from '../jobs/billSync'

export const syncRouter = Router()

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // Allow in development without a secret

  const provided = req.headers['x-cron-secret'] ?? req.headers.authorization?.replace('Bearer ', '')
  if (provided !== secret) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid cron secret' })
    return false
  }
  return true
}

// POST /api/sync/bills
syncRouter.post('/bills', async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return

  const { scope = 'full' } = req.query as Record<string, string>

  try {
    if (scope === 'federal') {
      const result = await syncFederalBills()
      res.json({ scope: 'federal', result })
    } else if (scope === 'state') {
      const result = await syncStateBills()
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
