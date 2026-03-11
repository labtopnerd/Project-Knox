/**
 * One-time historical bill backfill script.
 *
 * Usage:
 *   npm run backfill:bills
 *   npm run backfill:bills -- --sinceDays 365
 *   npm run backfill:bills -- --sinceDays 180 --states ca,ny,tx,fl
 *
 * Defaults: 365 days back, all 50 states.
 *
 * OpenStates rate limit: 500 req/day. With perPage=100 this script uses
 * roughly 1–5 requests per state depending on bill volume.
 * Run in batches (e.g. --states al,ak,az,ar,ca) across multiple days if
 * you hit the rate limit.
 *
 * Federal sync processes the full Congress #119 masterlist — unchanged bills
 * are skipped via the Redis change_hash cache so API usage is low on repeat runs.
 */

import 'dotenv/config'
import { syncFederalBills, syncStateBills } from '../jobs/billSync'
import { prisma } from '../lib/prisma'

const US_STATES = [
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga',
  'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md',
  'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj',
  'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc',
  'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy',
]

function parseArgs(): { sinceDays: number; states: string[] } {
  const args = process.argv.slice(2)
  let sinceDays = 365
  let states = US_STATES

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sinceDays' && args[i + 1]) {
      sinceDays = parseInt(args[i + 1]!, 10)
      i++
    } else if (args[i] === '--states' && args[i + 1]) {
      states = args[i + 1]!.split(',').map((s) => s.trim().toLowerCase())
      i++
    }
  }

  return { sinceDays, states }
}

async function main() {
  const { sinceDays, states } = parseArgs()

  console.log(`[Backfill] Starting historical bill backfill`)
  console.log(`[Backfill]   Federal: Congress #119, full masterlist`)
  console.log(`[Backfill]   State:   ${states.length} states, last ${sinceDays} days`)

  const log = await prisma.syncLog.create({ data: { job: 'backfill:bills', status: 'running' } })
  const start = Date.now()

  try {
    // Federal — process full masterlist; unchanged bills are skipped via change_hash cache
    console.log('\n[Backfill] === Federal bills ===')
    const federal = await syncFederalBills(119)
    console.log(`[Backfill] Federal: ${federal.synced} synced, ${federal.skipped} skipped, ${federal.errors} errors`)

    // State — historical window
    console.log(`\n[Backfill] === State bills (${sinceDays} days) ===`)
    const state = await syncStateBills(sinceDays, states)
    console.log(`[Backfill] State: ${state.synced} synced, ${state.errors} errors, ${state.statesProcessed} states`)

    const duration = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`\n[Backfill] Done in ${duration}s`)
    console.log(`[Backfill] Total new/updated: ${federal.synced + state.synced} bills`)

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        durationMs: Date.now() - start,
        result: {
          federalSynced: federal.synced,
          federalSkipped: federal.skipped,
          federalErrors: federal.errors,
          stateSynced: state.synced,
          stateErrors: state.errors,
          statesProcessed: state.statesProcessed,
        },
      },
    })
  } catch (err) {
    console.error('[Backfill] Fatal error:', err)
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'failed', completedAt: new Date(), error: String(err) },
    }).catch(() => {})
    throw err
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
