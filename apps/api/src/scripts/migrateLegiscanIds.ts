/**
 * One-time migration script: congress:{bioguideId} → legiscan:{people_id}
 *
 * Matches existing federal reps in the DB to LegiScan people by last name + stateCode.
 *
 * Run once:
 *   npx dotenv -e apps/api/.env -- npx tsx apps/api/src/scripts/migrateLegiscanIds.ts
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { getUSSessionId, getSessionPeople } from '../services/legiscan/client'
import { parseStateFromDistrict } from '../services/legiscan/transformers'

function extractLastName(fullName: string): string {
  // Strip title prefix: "Rep. ", "Sen. ", "Del. "
  let name = fullName.replace(/^(Rep\.|Sen\.|Del\.)\s+/i, '').trim()

  // "Klobuchar, Amy [D-MN]" → "klobuchar"
  // "Buchanan, Vern [R-FL-16]" → "buchanan"
  if (name.includes(',')) {
    return (name.split(',')[0] ?? '').trim().toLowerCase()
  }

  // "Bernie Sanders" → "sanders"
  const parts = name.trim().split(/\s+/)
  return (parts[parts.length - 1] ?? '').toLowerCase()
}

async function run() {
  console.log('[MigrateLegiScan] Starting migration...')

  const sessionId = await getUSSessionId(119)
  if (!sessionId) {
    console.error('[MigrateLegiScan] Could not get LegiScan session ID — check LEGISCAN_API_KEY')
    process.exit(1)
  }

  const people = await getSessionPeople(sessionId)
  if (!people.length) {
    console.error('[MigrateLegiScan] No people returned from LegiScan — check API key and session')
    process.exit(1)
  }

  console.log(`[MigrateLegiScan] Loaded ${people.length} people from LegiScan`)

  // Build index: "lastName|stateCode" → people_id
  const index = new Map<string, number>()
  for (const person of people) {
    const lastName = person.last_name.toLowerCase()
    const stateCode = parseStateFromDistrict(person.district)
    const key = `${lastName}|${stateCode}`
    index.set(key, person.people_id)
  }

  // Find all reps with congress: externalIds
  const reps = await prisma.representative.findMany({
    where: {
      source: 'congress',
      externalId: { startsWith: 'congress:' },
    },
    select: { id: true, externalId: true, fullName: true, stateCode: true },
  })

  console.log(`[MigrateLegiScan] Found ${reps.length} DB reps with congress: externalIds`)

  let matched = 0
  let unmatched = 0

  for (const rep of reps) {
    const lastName = extractLastName(rep.fullName)
    const stateCode = rep.stateCode ?? ''
    const key = `${lastName}|${stateCode}`
    const peopleId = index.get(key)

    if (peopleId != null) {
      const newExternalId = `legiscan:${peopleId}`
      await prisma.representative.update({
        where: { id: rep.id },
        data: { externalId: newExternalId },
      })
      console.log(`  ✓ ${rep.fullName} (${rep.stateCode}): ${rep.externalId} → ${newExternalId}`)
      matched++
    } else {
      console.log(`  ✗ ${rep.fullName} (${rep.stateCode}): no LegiScan match for key="${key}"`)
      unmatched++
    }
  }

  console.log(`\n[MigrateLegiScan] Done: ${matched} matched, ${unmatched} unmatched`)
  await prisma.$disconnect()
}

run().catch((err) => {
  console.error('[MigrateLegiScan] Fatal error:', err)
  process.exit(1)
})
