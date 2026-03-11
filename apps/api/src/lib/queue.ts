/**
 * pg-boss job queue
 *
 * Uses the same Postgres database as Prisma — no extra infrastructure needed.
 * Jobs are stored in pgboss.* schema tables with SKIP LOCKED for exactly-once delivery.
 *
 * Job types:
 *   sync-rep          — sync a single rep's sponsored bills + roll calls from LegiScan
 *   backfill-rollcalls — backfill roll calls for a batch of bills
 *   poll-rss          — fetch Congress.gov RSS and queue new bills
 */

import { PgBoss } from 'pg-boss'

export interface SyncRepJobData {
  repId: string
  peopleId: number
}

export interface BackfillRollCallsJobData {
  limit?: number
}

export interface SyncRepHistoryJobData {
  repId:        string
  peopleId:     number
  sessionId:    number
  yearStart:    number
  yearEnd:      number
  sessionTitle: string
}

let boss: PgBoss | null = null

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) throw new Error('[Queue] DATABASE_URL or DIRECT_URL must be set')

  boss = new PgBoss({
    connectionString,
    // Check for new work every 2 seconds
    monitorIntervalSeconds: 2,
  })

  boss.on('error', (err) => console.error('[Queue] pg-boss error:', err))

  await boss.start()
  console.log('[Queue] pg-boss started')
  return boss
}

export async function stopQueue(): Promise<void> {
  if (boss) {
    await boss.stop()
    boss = null
  }
}
