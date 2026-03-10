/**
 * Backfills federal congressional votes using US House Clerk + Senate XML files.
 *
 * Completely free and unlimited — zero LegiScan API calls:
 *   House: https://clerk.house.gov/evs/{year}/roll{num}.xml
 *   Senate: https://www.senate.gov/legislative/LIS/roll_call_votes/vote{C}{S}/vote_{C}_{S}_{N}.xml
 *
 * Member cross-reference: built from our DB (last name + state + party + chamber).
 * No external API calls needed for the cross-reference — 99.8% accuracy (1 duplicate in 548 reps).
 *
 * Roll call IDs: uses synthetic negative integers to avoid collisions with LegiScan IDs.
 *   House:  -(year * 10000 + rollNum)          e.g. -20230025
 *   Senate: -(congress * 10000000 + session * 1000000 + rollNum) e.g. -1181000010
 *
 * Options (env vars):
 *   CONGRESS=118   only process this congress number (default: 117,118)
 *   DRY_RUN=1      log actions but don't write to DB
 *   SLEEP_MS=100   ms between XML fetches (default: 100)
 *
 * Run with:
 *   npx tsx src/scripts/backfillCongressVotes.ts
 *   CONGRESS=118 npx tsx src/scripts/backfillCongressVotes.ts
 */

import 'dotenv/config'
import axios from 'axios'
import { prisma } from '../lib/prisma'

const DRY_RUN = process.env.DRY_RUN === '1'
const SLEEP_MS = parseInt(process.env.SLEEP_MS ?? '100', 10)
const CONGRESS_FILTER = process.env.CONGRESS ? parseInt(process.env.CONGRESS, 10) : null

// Max consecutive 404s before we consider a session exhausted
const MAX_CONSECUTIVE_MISSING = 5

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedVote {
  rollCallId: number  // synthetic negative integer
  chamber: 'house' | 'senate'
  congress: number
  date: Date
  question: string
  result: string
  passed: boolean
  yea: number
  nay: number
  nv: number
  absent: number
  total: number
  legisNum: string | null
  // house: (lastName+state+party) → vote_text; senate: (firstName+lastName+state) → vote_text
  votes: Array<{ firstName?: string; lastName?: string; state: string; party?: string; voteText: string }>
}

// ─── Step 1: Build DB-based lookup maps ───────────────────────────────────────

/**
 * Builds two lookup maps from our DB federal representatives:
 *   houseMap:  "lastName:stateCode:partyAbbr" → repId   (e.g. "adams:nc:d")
 *   senateMap: "lastName:stateCode:senate"    → repId   (e.g. "warren:ma:senate")
 *
 * House key uses party abbreviation (D/R/I) to disambiguate same-surname pairs.
 * Senate key omits party — senators are unique enough by name+state alone.
 */
async function buildDbLookupMaps(): Promise<{
  houseMap: Map<string, string>
  senateMap: Map<string, string>
}> {
  const reps = await prisma.representative.findMany({
    where: { externalId: { startsWith: 'legiscan:' }, level: 'federal' },
    select: { id: true, fullName: true, stateCode: true, party: true, chamber: true },
  })

  const houseMap = new Map<string, string>()
  const senateMap = new Map<string, string>()

  for (const rep of reps) {
    const parts = rep.fullName.trim().split(' ')
    const lastName = parts[parts.length - 1]?.toLowerCase() ?? ''
    const state = rep.stateCode?.toLowerCase() ?? ''

    if (rep.chamber === 'house') {
      // Reverse the party map to get abbreviation
      const partyAbbr = rep.party === 'Democrat' ? 'd' : rep.party === 'Republican' ? 'r' : 'i'
      const key = `${lastName}:${state}:${partyAbbr}`
      houseMap.set(key, rep.id)
    } else if (rep.chamber === 'senate') {
      const key = `${lastName}:${state}:senate`
      senateMap.set(key, rep.id)
    }
  }

  console.log(`[DbLookup] House map: ${houseMap.size} entries, Senate map: ${senateMap.size} entries`)
  return { houseMap, senateMap }
}

// ─── Step 2: Parse bill identifier ────────────────────────────────────────────

const LEGIS_NUM_MAP: Array<[RegExp, string]> = [
  [/^H J RES (\d+)$/i, 'hjres'],
  [/^H CON RES (\d+)$/i, 'hconres'],
  [/^S J RES (\d+)$/i, 'sjres'],
  [/^S CON RES (\d+)$/i, 'sconres'],
  [/^H RES (\d+)$/i, 'hres'],
  [/^S RES (\d+)$/i, 'sres'],
  [/^H R (\d+)$/i, 'hr'],
  [/^S (\d+)$/i, 's'],
]

function parseLegisNum(raw: string, congress: number): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, ' ')
  for (const [pattern, type] of LEGIS_NUM_MAP) {
    const m = s.match(pattern)
    if (m) return `congress:${congress}:${type}:${m[1]}`
  }
  return null
}

// ─── Step 3: Parse House Clerk XML ────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`))
  return m?.[1]?.trim() ?? ''
}

function parseHouseXml(xml: string, congress: number, year: number, rollNum: number): ParsedVote | null {
  const voteType = extractTag(xml, 'vote-type')
  // Skip quorum calls, journals, etc.
  if (!voteType || voteType === 'QUORUM' || voteType === 'QUORUMCALL') return null

  const legisNum = extractTag(xml, 'legis-num')
  const question = extractTag(xml, 'vote-question')
  const result = extractTag(xml, 'vote-result')
  const dateStr = extractTag(xml, 'action-date') // "3-Jan-2023"

  if (!dateStr) return null
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null

  // Parse totals
  const yea = parseInt(extractTag(xml, 'yea-total') || '0', 10)
  const nay = parseInt(extractTag(xml, 'nay-total') || '0', 10)
  const nv = parseInt(extractTag(xml, 'present-total') || '0', 10)
  const absent = parseInt(extractTag(xml, 'not-voting-total') || '0', 10)

  // Extract all recorded votes
  const votes: ParsedVote['votes'] = []
  const voteMatches = xml.matchAll(/<recorded-vote>[\s\S]*?<\/recorded-vote>/g)
  for (const match of voteMatches) {
    const block = match[0]!
    const lastName = block.match(/sort-field="([^"]+)"/)?.[1] ?? ''
    const state = block.match(/state="([^"]+)"/)?.[1] ?? ''
    const partyRaw = block.match(/party="([^"]+)"/)?.[1] ?? ''
    const party = partyRaw.toLowerCase()
    const voteText = extractTag(block, 'vote')
    if (lastName && state && voteText) {
      votes.push({ lastName, state, party, voteText })
    }
  }

  if (votes.length === 0) return null

  return {
    rollCallId: -(year * 10000 + rollNum),
    chamber: 'house',
    congress,
    date,
    question,
    result,
    passed: result.toLowerCase().includes('passed') || result.toLowerCase().includes('agreed'),
    yea,
    nay,
    nv,
    absent,
    total: yea + nay + nv + absent,
    legisNum: legisNum || null,
    votes,
  }
}

// ─── Step 4: Parse Senate XML ─────────────────────────────────────────────────

function parseSenateXml(xml: string, congress: number, session: number, rollNum: number): ParsedVote | null {
  const question = extractTag(xml, 'vote_question_text') || extractTag(xml, 'vote_question')
  const result = extractTag(xml, 'vote_result_text') || extractTag(xml, 'vote_result')
  const dateStr = extractTag(xml, 'vote_date') // "January 3, 2023, 01:16 PM"
  if (!dateStr) return null

  const date = new Date(dateStr.replace(/,\s*\d{2}:\d{2}\s*(AM|PM)/, ''))
  if (isNaN(date.getTime())) return null

  const yea = parseInt(extractTag(xml, 'yeas') || '0', 10)
  const nay = parseInt(extractTag(xml, 'nays') || '0', 10)
  const absent = parseInt(extractTag(xml, 'absent') || '0', 10)
  const nv = parseInt(extractTag(xml, 'abstains') || '0', 10)

  // Get document info (the bill being voted on)
  const docCongress = parseInt(extractTag(xml, 'document_congress') || '0', 10)
  const docType = extractTag(xml, 'document_type')
  const docNumber = extractTag(xml, 'document_number')
  let legisNum: string | null = null
  if (docType && docNumber && docCongress > 0) {
    // Convert Senate XML document_type to our format
    const typeMap: Record<string, string> = {
      'S': 's', 'HR': 'hr', 'HJRES': 'hjres', 'SJRES': 'sjres',
      'HCONRES': 'hconres', 'SCONRES': 'sconres', 'HRES': 'hres', 'SRES': 'sres',
      'S.': 's', 'H.R.': 'hr', 'PN': null as unknown as string,
    }
    const mappedType = typeMap[docType.toUpperCase()]
    if (mappedType != null) {
      legisNum = `congress:${docCongress || congress}:${mappedType}:${docNumber}`
    }
  }

  // Extract member votes
  const votes: ParsedVote['votes'] = []
  const memberMatches = xml.matchAll(/<member>[\s\S]*?<\/member>/g)
  for (const match of memberMatches) {
    const block = match[0]!
    const firstName = extractTag(block, 'first_name')
    const lastName = extractTag(block, 'last_name')
    const state = extractTag(block, 'state')
    const voteText = extractTag(block, 'vote_cast')
    if (lastName && state && voteText) {
      votes.push({ firstName, lastName, state, voteText })
    }
  }

  if (votes.length === 0) return null

  return {
    rollCallId: -(congress * 10000000 + session * 1000000 + rollNum),
    chamber: 'senate',
    congress,
    date,
    question,
    result,
    passed: result.toLowerCase().includes('passed') || result.toLowerCase().includes('agreed') || result.toLowerCase().includes('confirmed'),
    yea,
    nay,
    nv,
    absent,
    total: yea + nay + nv + absent,
    legisNum,
    votes,
  }
}

// ─── Step 5: Resolve member votes to rep IDs ──────────────────────────────────

function resolveHouseVotes(
  parsedVotes: ParsedVote['votes'],
  houseMap: Map<string, string>,
): Array<{ repId: string; voteText: string }> {
  const result: Array<{ repId: string; voteText: string }> = []
  for (const v of parsedVotes) {
    if (!v.lastName || !v.state) continue
    const key = `${v.lastName.toLowerCase()}:${v.state.toLowerCase()}:${v.party ?? ''}`
    const repId = houseMap.get(key)
    if (repId) result.push({ repId, voteText: v.voteText })
  }
  return result
}

function resolveSenateVotes(
  parsedVotes: ParsedVote['votes'],
  lastNameStateMap: Map<string, string>,
): Array<{ repId: string; voteText: string }> {
  const result: Array<{ repId: string; voteText: string }> = []
  for (const v of parsedVotes) {
    if (!v.lastName || !v.state) continue
    const key = `${v.lastName.toLowerCase()}:${v.state.toLowerCase()}:senate`
    const repId = lastNameStateMap.get(key)
    if (repId) result.push({ repId, voteText: v.voteText })
  }
  return result
}

// ─── Step 6: Write roll call + votes to DB ────────────────────────────────────

async function writeVotes(
  parsed: ParsedVote,
  billDbId: string | null,
  resolvedVotes: Array<{ repId: string; voteText: string }>,
): Promise<{ created: boolean; votes: number }> {
  if (resolvedVotes.length === 0) return { created: false, votes: 0 }
  if (DRY_RUN) return { created: true, votes: resolvedVotes.length }

  // If no bill found, skip (we only care about bill-linked votes for the UI)
  if (!billDbId) return { created: false, votes: 0 }

  const dbRc = await prisma.rollCall.upsert({
    where: { rollCallId: parsed.rollCallId },
    create: {
      rollCallId: parsed.rollCallId,
      billId: billDbId,
      date: parsed.date,
      description: parsed.question,
      yea: parsed.yea,
      nay: parsed.nay,
      nv: parsed.nv,
      absent: parsed.absent,
      total: parsed.total,
      passed: parsed.passed,
      chamber: parsed.chamber,
    },
    update: { yea: parsed.yea, nay: parsed.nay, nv: parsed.nv, absent: parsed.absent, total: parsed.total, passed: parsed.passed },
  })

  const result = await prisma.repVote.createMany({
    data: resolvedVotes.map((v) => ({ rollCallId: dbRc.id, representativeId: v.repId, voteText: v.voteText })),
    skipDuplicates: true,
  })

  return { created: true, votes: result.count }
}

// ─── Step 7: Fetch and process all House votes for a year ─────────────────────

async function processHouseYear(
  year: number,
  congress: number,
  houseMap: Map<string, string>,
  billCache: Map<string, string | null>,
): Promise<{ rollCalls: number; votes: number; skipped: number }> {
  let rollCalls = 0
  let votes = 0
  let skipped = 0
  let consecutive404s = 0
  let rollNum = 1

  while (consecutive404s < MAX_CONSECUTIVE_MISSING) {
    const padded = String(rollNum).padStart(3, '0')
    const url = `https://clerk.house.gov/evs/${year}/roll${padded}.xml`

    try {
      const { data: xml } = await axios.get<string>(url, {
        timeout: 15000,
        validateStatus: (s) => s < 500,
        responseType: 'text',
      })

      if (typeof xml !== 'string' || xml.includes('404') || !xml.includes('<rollcall-vote>')) {
        consecutive404s++
        rollNum++
        await sleep(SLEEP_MS)
        continue
      }

      consecutive404s = 0
      const parsed = parseHouseXml(xml, congress, year, rollNum)

      if (!parsed) { skipped++; rollNum++; await sleep(SLEEP_MS); continue }

      // Look up bill
      let billDbId: string | null | undefined = parsed.legisNum ? billCache.get(parsed.legisNum) : null
      if (billDbId === undefined && parsed.legisNum) {
        const bill = await prisma.bill.findUnique({ where: { externalId: parsed.legisNum }, select: { id: true } })
        billDbId = bill?.id ?? null
        billCache.set(parsed.legisNum, billDbId)
      }

      // Check if already processed
      const existing = await prisma.rollCall.findUnique({ where: { rollCallId: parsed.rollCallId }, select: { id: true } })
      if (existing) { skipped++; rollNum++; continue }

      const resolved = resolveHouseVotes(parsed.votes, houseMap)
      const result = await writeVotes(parsed, billDbId ?? null, resolved)
      if (result.created) { rollCalls++; votes += result.votes }
      else skipped++
    } catch {
      consecutive404s++
    }

    rollNum++
    await sleep(SLEEP_MS)
  }

  return { rollCalls, votes, skipped }
}

// ─── Step 8: Fetch and process all Senate votes for a congress+session ────────

async function processSenateSession(
  congress: number,
  session: number,
  lastNameStateMap: Map<string, string>,
  billCache: Map<string, string | null>,
): Promise<{ rollCalls: number; votes: number; skipped: number }> {
  let rollCalls = 0
  let votes = 0
  let skipped = 0
  let consecutive404s = 0
  let rollNum = 1

  while (consecutive404s < MAX_CONSECUTIVE_MISSING) {
    const padded = String(rollNum).padStart(5, '0')
    const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${padded}.xml`

    try {
      const { data: xml, status } = await axios.get<string>(url, {
        timeout: 15000,
        validateStatus: (s) => s < 500,
        responseType: 'text',
        headers: { 'User-Agent': 'ProjectKnox/1.0 (civic data; https://projectknox.app)' },
      })

      if (status === 404 || typeof xml !== 'string' || !xml.includes('<roll_call_vote>')) {
        consecutive404s++
        rollNum++
        await sleep(SLEEP_MS)
        continue
      }

      consecutive404s = 0
      const parsed = parseSenateXml(xml, congress, session, rollNum)

      if (!parsed) { skipped++; rollNum++; await sleep(SLEEP_MS); continue }

      // Look up bill
      let billDbId: string | null | undefined = parsed.legisNum ? billCache.get(parsed.legisNum) : null
      if (billDbId === undefined && parsed.legisNum) {
        const bill = await prisma.bill.findUnique({ where: { externalId: parsed.legisNum }, select: { id: true } })
        billDbId = bill?.id ?? null
        billCache.set(parsed.legisNum, billDbId)
      }

      // Check if already processed
      const existing = await prisma.rollCall.findUnique({ where: { rollCallId: parsed.rollCallId }, select: { id: true } })
      if (existing) { skipped++; rollNum++; continue }

      const resolved = resolveSenateVotes(parsed.votes, lastNameStateMap)
      const result = await writeVotes(parsed, billDbId ?? null, resolved)
      if (result.created) { rollCalls++; votes += result.votes }
      else skipped++
    } catch {
      consecutive404s++
    }

    rollNum++
    await sleep(SLEEP_MS)
  }

  return { rollCalls, votes, skipped }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const CONGRESSES: Record<number, { years: number[]; sessions: [number, number][] }> = {
  117: { years: [2021, 2022], sessions: [[117, 1], [117, 2]] },
  118: { years: [2023, 2024], sessions: [[118, 1], [118, 2]] },
  119: { years: [2025, 2026], sessions: [[119, 1]] },
}

async function main() {
  if (DRY_RUN) console.log('[CongressVotes] *** DRY_RUN mode ***\n')

  // Build member cross-reference maps from our DB — no external API calls needed
  const { houseMap, senateMap: lastNameStateMap } = await buildDbLookupMaps()

  const billCache = new Map<string, string | null>()
  const congressList = CONGRESS_FILTER ? [CONGRESS_FILTER] : [117, 118, 119]

  for (const congress of congressList) {
    const config = CONGRESSES[congress]
    if (!config) { console.warn(`[CongressVotes] Unknown congress ${congress}`); continue }

    console.log(`\n[CongressVotes] ══ ${congress}th Congress ══`)

    // House — one XML file per roll call per year
    for (const year of config.years) {
      console.log(`[CongressVotes] House ${year}...`)
      const result = await processHouseYear(year, congress, houseMap, billCache)
      console.log(`[CongressVotes] House ${year} — ${result.rollCalls} roll calls, ${result.votes} votes, ${result.skipped} skipped`)
    }

    // Senate — one XML per roll call per session
    for (const [c, s] of config.sessions) {
      console.log(`[CongressVotes] Senate ${c}th Congress session ${s}...`)
      const result = await processSenateSession(c, s, lastNameStateMap, billCache)
      console.log(`[CongressVotes] Senate ${c}/${s} — ${result.rollCalls} roll calls, ${result.votes} votes, ${result.skipped} skipped`)
    }
  }

  console.log('\n[CongressVotes] Done')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
