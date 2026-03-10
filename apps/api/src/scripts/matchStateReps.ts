/**
 * One-time script: matches OpenStates-sourced state representatives to LegiScan
 * people_ids, enabling voting history sync for state reps.
 *
 * Strategy:
 *   1. Find all reps in DB with openstates: externalId and a known stateCode
 *   2. For each state, call getSessionList(stateCode) → get most recent 2 sessions
 *   3. For each session, call getSessionPeople(sessionId) → get all legislators
 *   4. Match against our DB reps by normalized name + party + chamber
 *   5. On confident match, write legiscanPeopleId to the rep record
 *   6. Seed RepSession rows for the matched rep using getSponsoredList
 *
 * Run with:
 *   npx tsx src/scripts/matchStateReps.ts
 *
 * Options (env vars):
 *   STATE=CA          — only process a single state
 *   DRY_RUN=1         — print matches without writing to DB
 */

import 'dotenv/config'
import { prisma } from '../lib/prisma'
import { getSessionList, getSessionPeople, getSponsoredList } from '../services/legiscan/client'

const DRY_RUN = process.env.DRY_RUN === '1'
const STATE_FILTER = process.env.STATE?.toUpperCase()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeParty(party: string | null | undefined): string {
  if (!party) return ''
  const p = party.toLowerCase()
  if (p.startsWith('r') || p === 'gop') return 'R'
  if (p.startsWith('d')) return 'D'
  if (p.startsWith('i')) return 'I'
  return party.toUpperCase().slice(0, 1)
}

// LegiScan role_id: 1 = House, 2 = Senate
function chamberFromRoleId(roleId: number): string | null {
  if (roleId === 1) return 'state_house'
  if (roleId === 2) return 'state_senate'
  return null
}

async function processState(stateCode: string, dbReps: Array<{
  id: string; fullName: string; party: string | null; chamber: string; district: string | null; externalId: string
}>): Promise<{ matched: number; ambiguous: number; unmatched: number }> {
  let matched = 0
  let ambiguous = 0
  let unmatched = 0

  const sessions = await getSessionList(stateCode)
  if (!sessions.length) {
    console.log(`[MatchStateReps] ${stateCode}: no sessions found`)
    return { matched, ambiguous, unmatched }
  }

  // Sort descending, take the 3 most recent sessions
  const recentSessions = sessions
    .sort((a, b) => b.year_start - a.year_start)
    .slice(0, 3)

  // Build a map of legiscan person -> session list for session seeding
  const peopleToSessions = new Map<number, typeof recentSessions>()

  // Collect all legislators from recent sessions, deduplicated by people_id
  const legislatorMap = new Map<number, { name: string; party: string; role_id: number; district: string }>()

  for (const session of recentSessions) {
    const people = await getSessionPeople(session.session_id)
    for (const person of people) {
      if (!legislatorMap.has(person.people_id)) {
        legislatorMap.set(person.people_id, {
          name: person.name,
          party: person.party,
          role_id: person.role_id,
          district: person.district,
        })
      }
      const existing = peopleToSessions.get(person.people_id) ?? []
      if (!existing.some(s => s.session_id === session.session_id)) {
        existing.push(session)
        peopleToSessions.set(person.people_id, existing)
      }
    }
    await sleep(200)
  }

  console.log(`[MatchStateReps] ${stateCode}: ${legislatorMap.size} unique legislators across ${recentSessions.length} sessions`)

  // Try to match each DB rep to a LegiScan person
  for (const dbRep of dbReps) {
    const dbNameNorm = normalizeName(dbRep.fullName)
    const dbParty = normalizeParty(dbRep.party)

    const candidates: Array<{ peopleId: number; score: number }> = []

    for (const [peopleId, person] of legislatorMap) {
      const lsNameNorm = normalizeName(person.name)
      const lsParty = normalizeParty(person.party)
      const lsChamber = chamberFromRoleId(person.role_id)

      // Name must match exactly (normalized)
      if (lsNameNorm !== dbNameNorm) continue

      let score = 1

      // Party match bonus
      if (dbParty && lsParty && dbParty === lsParty) score += 2

      // Chamber match bonus
      if (lsChamber && lsChamber === dbRep.chamber) score += 2

      // District match bonus (simple string comparison after stripping state prefix)
      if (dbRep.district) {
        const lsDist = person.district.replace(/^[A-Z]+-?/, '')
        if (lsDist === dbRep.district || person.district === dbRep.district) score += 1
      }

      candidates.push({ peopleId, score })
    }

    if (candidates.length === 0) {
      unmatched++
      continue
    }

    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]

    if (candidates.length > 1 && candidates[1].score === best.score) {
      // Ambiguous — two equally good matches
      console.log(`[MatchStateReps] ${stateCode}: AMBIGUOUS match for ${dbRep.fullName} (score=${best.score})`)
      ambiguous++
      continue
    }

    // Confident match
    const lsPerson = legislatorMap.get(best.peopleId)!
    console.log(`[MatchStateReps] ${stateCode}: MATCH ${dbRep.fullName} → people_id ${best.peopleId} (${lsPerson.name}, score=${best.score})${DRY_RUN ? ' [DRY RUN]' : ''}`)
    matched++

    if (!DRY_RUN) {
      await prisma.representative.update({
        where: { id: dbRep.id },
        data: { legiscanPeopleId: best.peopleId, legiscanStateCode: stateCode },
      })

      // Seed RepSession rows for this rep using their sponsored bill sessions
      try {
        const sessions = await getSessionList(stateCode)
        const sessionMap = new Map(sessions.map(s => [s.session_id, s]))
        const sponsoredBills = await getSponsoredList(best.peopleId)
        const uniqueSessionIds = [...new Set(sponsoredBills.map(b => b.session_id))]

        let seededCount = 0
        for (const sid of uniqueSessionIds) {
          const session = sessionMap.get(sid)
          if (!session) continue
          await prisma.repSession.upsert({
            where: { representativeId_sessionId: { representativeId: dbRep.id, sessionId: sid } },
            create: {
              representativeId: dbRep.id,
              sessionId: sid,
              yearStart: session.year_start,
              yearEnd: session.year_end,
              sessionTitle: session.session_title,
            },
            update: {},
          })
          seededCount++
        }

        if (seededCount > 0) {
          console.log(`[MatchStateReps] ${stateCode}: seeded ${seededCount} sessions for ${dbRep.fullName}`)
        }
        await sleep(300)
      } catch (err) {
        console.error(`[MatchStateReps] Failed to seed sessions for ${dbRep.fullName}:`, err)
      }
    }
  }

  return { matched, ambiguous, unmatched }
}

async function main() {
  console.log(`[MatchStateReps] Starting${DRY_RUN ? ' (DRY RUN)' : ''}${STATE_FILTER ? ` for ${STATE_FILTER}` : ''}`)

  // Fetch all OpenStates-sourced reps without a legiscanPeopleId yet
  const where: Record<string, unknown> = {
    externalId: { startsWith: 'openstates:' },
    legiscanPeopleId: null,
    level: 'state',
  }
  if (STATE_FILTER) {
    where.stateCode = STATE_FILTER
  }

  const dbReps = await prisma.representative.findMany({
    where,
    select: { id: true, fullName: true, party: true, chamber: true, district: true, externalId: true, stateCode: true },
  })

  // Group by stateCode
  const byState = new Map<string, typeof dbReps>()
  for (const rep of dbReps) {
    if (!rep.stateCode) continue
    const list = byState.get(rep.stateCode) ?? []
    list.push(rep)
    byState.set(rep.stateCode, list)
  }

  console.log(`[MatchStateReps] ${dbReps.length} state reps across ${byState.size} states`)

  let totalMatched = 0
  let totalAmbiguous = 0
  let totalUnmatched = 0

  for (const [stateCode, reps] of byState) {
    try {
      const result = await processState(stateCode, reps)
      totalMatched += result.matched
      totalAmbiguous += result.ambiguous
      totalUnmatched += result.unmatched
    } catch (err) {
      console.error(`[MatchStateReps] Error processing state ${stateCode}:`, err)
    }
    await sleep(500)
  }

  console.log(
    `[MatchStateReps] Done — matched: ${totalMatched}, ambiguous: ${totalAmbiguous}, unmatched: ${totalUnmatched}`,
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
