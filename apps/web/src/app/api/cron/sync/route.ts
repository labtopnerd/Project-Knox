/**
 * Vercel Cron Job — triggered by vercel.json cron schedule.
 * Calls the Express API server to run the full bill sync + notifications.
 *
 * Vercel Cron docs: https://vercel.com/docs/cron-jobs
 * Set CRON_SECRET to a random string in Vercel env vars.
 */
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes — bill sync can be slow

export async function GET(request: NextRequest) {
  // Verify this is a legitimate Vercel Cron request
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

  try {
    const response = await fetch(`${apiUrl}/api/sync/bills?scope=full`, {
      method: 'POST',
      headers: {
        'x-cron-secret': cronSecret ?? '',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[Cron] API sync failed:', text)
      return NextResponse.json(
        { error: 'Sync failed', detail: text },
        { status: 500 },
      )
    }

    const result = await response.json()
    console.log('[Cron] Sync triggered successfully:', JSON.stringify(result))
    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[Cron] Error triggering sync:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
