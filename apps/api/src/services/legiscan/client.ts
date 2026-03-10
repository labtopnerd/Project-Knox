/**
 * LegiScan API client
 * Documentation: https://legiscan.com/legiscan
 * Free tier: 30,000 req/month
 * Auth: query param key=LEGISCAN_API_KEY
 * Style: RPC — ?key=KEY&op=getBill&id=12345
 */

import axios from 'axios'
import { cacheGet, cacheSet, TTL } from '../../lib/redis'

const BASE_URL = 'https://api.legiscan.com/'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LegiScanSession {
  session_id: number
  session_title: string
  year_start: number
  year_end: number
}

export interface LegiScanMasterBill {
  bill_id: number
  number: string
  change_hash: string
  status: number          // 1=Introduced, 2=Engrossed, 3=Enrolled, 4=Passed, 5=Vetoed, 6=Failed
  status_date: string
  last_action: string
  last_action_date: string
  title: string
  description?: string
}

export interface LegiScanBillSponsor {
  people_id: number
  person_hash: string
  party_id: number
  state_id: number
  party: string
  role: string
  name: string
  first_name: string
  middle_name: string
  last_name: string
  suffix: string
  nickname: string
  district: string
  ftm_eid: number
  votesmart_id: number
  opensecrets_id: string
  knowwho_pid: number
  ballotpedia: string
  sponsor_type_id: number
  sponsor_order: number
  committee_sponsor: number
  committee_id: number
}

export interface LegiScanBillText {
  doc_id: number
  date: string
  type: string
  type_id: number
  mime: string
  mime_id: number
  url: string
  state_link: string
  text_size: number
  text_hash: string
}

export interface LegiScanBillHistory {
  date: string
  action: string
  chamber: string
  chamber_id: number
  importance: number
}

export interface LegiScanBillVote {
  roll_call_id: number
  date: string
  desc: string
  yea: number
  nay: number
  nv: number
  absent: number
  total: number
  passed: number
  chamber: string
  chamber_id: number
}

export interface LegiScanRollCallVote {
  people_id: number
  vote_id:   number    // 1=Yea, 2=Nay, 3=Not Voting, 4=Absent
  vote_text: string    // "Yea" | "Nay" | "Not Voting" | "Absent"
}

export interface LegiScanRollCall {
  roll_call_id: number
  bill_id:      number
  date:         string   // "YYYY-MM-DD"
  desc:         string
  yea: number; nay: number; nv: number; absent: number; total: number
  passed:       number   // 0 | 1
  chamber:      string   // "H" | "S"
  chamber_id:   number
  votes:        LegiScanRollCallVote[]
}

export interface LegiScanBillDetail {
  bill_id: number
  bill_number: string
  title: string
  description: string
  status_id: number
  status_date: string
  history: LegiScanBillHistory[]
  sponsors: LegiScanBillSponsor[]
  votes: LegiScanBillVote[]
  texts: LegiScanBillText[]
  state: string
  session: LegiScanSession
}

export interface LegiScanPerson {
  people_id: number
  name: string
  first_name: string
  last_name: string
  party: string
  role: string
  role_id: number
  district: string
  state_id: number
}

export interface LegiScanSponsoredBill {
  bill_id: number
  number: string
  session_id: number
}

export interface LegiScanDataset {
  session_id:   number
  session_name: string
  year_start:   number
  year_end:     number
  state_id:     number
  state:        string   // e.g. "US", "CA"
  dataset_hash: string
  dataset_date: string
  dataset_size: number
  access_key:   string
}

export interface LegiScanDatasetZip {
  session_id: number
  mime:       string
  zip:        string   // base64-encoded ZIP
}

// ─── Private helper ───────────────────────────────────────────────────────────

async function legiscanRequest<T>(
  op: string,
  params?: Record<string, string | number>,
): Promise<T | null> {
  const apiKey = process.env.LEGISCAN_API_KEY
  if (!apiKey) {
    console.warn('[LegiScan] LEGISCAN_API_KEY not set — skipping request')
    return null
  }

  try {
    const response = await axios.get<{ status: string } & Record<string, unknown>>(BASE_URL, {
      params: { key: apiKey, op, ...params },
      timeout: 15000,
    })

    if (response.data?.status !== 'OK') {
      console.warn(`[LegiScan] Non-OK status for op=${op}:`, response.data)
      return null
    }

    return response.data as T
  } catch (err) {
    console.error(`[LegiScan] Request failed for op=${op}:`, err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getSessionList(state: string): Promise<LegiScanSession[]> {
  const cacheKey = `legiscan:sessions:${state}`
  const cached = await cacheGet<LegiScanSession[]>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; sessions: Record<string, LegiScanSession> }>(
    'getSessionList',
    { state },
  )
  if (!data?.sessions) return []

  const sessions = Object.values(data.sessions)
  await cacheSet(cacheKey, sessions, TTL.LEGISCAN_SESSION)
  return sessions
}

/**
 * Finds the session_id for a given congress number.
 * 119th Congress → year_start: 2025
 * Cache key: legiscan:session:{state}
 */
export async function getUSSessionId(congress: number): Promise<number | null> {
  const cacheKey = `legiscan:session:US:${congress}`
  const cached = await cacheGet<number>(cacheKey)
  if (cached) return cached

  const sessions = await getSessionList('US')
  // 119th Congress started 2025, 118th started 2023, etc.
  const yearStart = 2025 - (119 - congress) * 2
  const session = sessions.find((s) => s.year_start === yearStart)

  if (!session) {
    console.warn(`[LegiScan] No session found for US Congress #${congress} (year_start=${yearStart})`)
    return null
  }

  await cacheSet(cacheKey, session.session_id, TTL.LEGISCAN_SESSION)
  return session.session_id
}

/**
 * Returns masterlist dict (keys = bill_id strings).
 * Cache key: legiscan:master:{sessionId}
 */
export async function getMasterList(
  sessionId: number,
): Promise<Record<string, LegiScanMasterBill> | null> {
  const cacheKey = `legiscan:master:${sessionId}`
  const cached = await cacheGet<Record<string, LegiScanMasterBill>>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; masterlist: Record<string, LegiScanMasterBill> }>(
    'getMasterList',
    { id: sessionId },
  )
  if (!data?.masterlist) return null

  // masterlist has a "session" key with metadata — filter it out
  const bills: Record<string, LegiScanMasterBill> = {}
  for (const [key, val] of Object.entries(data.masterlist)) {
    if (typeof val === 'object' && val !== null && 'bill_id' in val) {
      bills[key] = val as LegiScanMasterBill
    }
  }

  await cacheSet(cacheKey, bills, TTL.LEGISCAN_MASTER)
  return bills
}

/**
 * Cache key: legiscan:bill:{billId}
 */
export async function getBill(billId: number): Promise<LegiScanBillDetail | null> {
  const cacheKey = `legiscan:bill:${billId}`
  const cached = await cacheGet<LegiScanBillDetail>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; bill: LegiScanBillDetail }>(
    'getBill',
    { id: billId },
  )
  if (!data?.bill) return null

  await cacheSet(cacheKey, data.bill, TTL.LEGISCAN_BILL)
  return data.bill
}

/**
 * Cache key: legiscan:people:{sessionId}
 */
export async function getSessionPeople(sessionId: number): Promise<LegiScanPerson[]> {
  const cacheKey = `legiscan:people:${sessionId}`
  const cached = await cacheGet<LegiScanPerson[]>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; sessionpeople: { people: LegiScanPerson[] } }>(
    'getSessionPeople',
    { id: sessionId },
  )
  if (!data?.sessionpeople?.people) return []

  await cacheSet(cacheKey, data.sessionpeople.people, TTL.LEGISCAN_PEOPLE)
  return data.sessionpeople.people
}

/**
 * Returns all available bulk datasets (one per session per state/US).
 * Requires Bulk API access (subscription tier).
 */
export async function getDatasetList(state?: string): Promise<LegiScanDataset[]> {
  const params: Record<string, string | number> = {}
  if (state) params.state = state

  const data = await legiscanRequest<{ status: string; datasetlist: Record<string, LegiScanDataset> }>(
    'getDatasetList',
    params,
  )
  if (!data?.datasetlist) return []
  return Object.values(data.datasetlist).filter((d) => typeof d === 'object' && 'session_id' in d)
}

/**
 * Downloads a bulk dataset ZIP for a session.
 * Returns the base64-encoded ZIP content, or null if unavailable.
 * Requires Bulk API access (subscription tier).
 */
export async function getDataset(datasetId: number, accessKey: string): Promise<LegiScanDatasetZip | null> {
  const data = await legiscanRequest<{ status: string; dataset: LegiScanDatasetZip }>(
    'getDataset',
    { id: datasetId, access_key: accessKey },
  )
  return data?.dataset ?? null
}

export interface LegiScanPersonSession {
  session_id:    number
  session_title: string
  year_start:    number
  year_end:      number
  state_id:      number
}

export interface LegiScanPersonBioResponse {
  person:   LegiScanPerson
  sessions: LegiScanPersonSession[]
}

export interface LegiScanPersonVoteEntry {
  session_id:   number
  roll_call_id: number
  bill_id:      number
  date:         string   // "YYYY-MM-DD"
  desc:         string
  vote_id:      number
  vote_text:    string   // "Yea" | "Nay" | "Not Voting" | "Absent"
  yea:          number
  nay:          number
  nv:           number
  absent:       number
  total:        number
  passed:       number   // 0 | 1
  chamber:      string   // "H" | "S"
}

/**
 * Returns the rep's bio including their full session history.
 * Cache key: legiscan:bio:{peopleId}  (TTL: 24h)
 */
export async function getPersonBio(peopleId: number): Promise<LegiScanPersonBioResponse | null> {
  const cacheKey = `legiscan:bio:${peopleId}`
  const cached = await cacheGet<LegiScanPersonBioResponse>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; person_bio: LegiScanPersonBioResponse }>(
    'getPersonBio',
    { id: peopleId },
  )
  if (!data?.person_bio) return null

  await cacheSet(cacheKey, data.person_bio, TTL.LEGISCAN_BIO)
  return data.person_bio
}

/**
 * Returns all roll call votes for a person across all sessions.
 * Filter client-side by session_id when you only need one session.
 * Cache key: legiscan:personvotes:{peopleId}  (TTL: 1h)
 */
export async function getPersonVotes(peopleId: number): Promise<LegiScanPersonVoteEntry[]> {
  const cacheKey = `legiscan:personvotes:${peopleId}`
  const cached = await cacheGet<LegiScanPersonVoteEntry[]>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{
    status: string
    personvotes: { person: LegiScanPerson; votes: LegiScanPersonVoteEntry[] }
  }>(
    'getPersonVotes',
    { id: peopleId },
  )
  const votes = data?.personvotes?.votes ?? []
  if (votes.length > 0) await cacheSet(cacheKey, votes, TTL.LEGISCAN_PERSON_VOTES)
  return votes
}

export async function getSponsoredList(peopleId: number): Promise<LegiScanSponsoredBill[]> {
  const cacheKey = `legiscan:sponsored:${peopleId}`
  const cached = await cacheGet<LegiScanSponsoredBill[]>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; sponsoredbills: { bills: LegiScanSponsoredBill[] } }>(
    'getSponsoredList',
    { id: peopleId },
  )
  const bills = data?.sponsoredbills?.bills ?? []
  if (bills.length > 0) await cacheSet(cacheKey, bills, TTL.LEGISCAN_SPONSORED)
  return bills
}

/**
 * Cache key: legiscan:rollcall:{rollCallId}  (TTL: 24h — immutable)
 */
export async function getRollCall(rollCallId: number): Promise<LegiScanRollCall | null> {
  const cacheKey = `legiscan:rollcall:${rollCallId}`
  const cached = await cacheGet<LegiScanRollCall>(cacheKey)
  if (cached) return cached

  const data = await legiscanRequest<{ status: string; roll_call: LegiScanRollCall }>(
    'getRollCall',
    { id: rollCallId },
  )
  if (!data?.roll_call) return null

  await cacheSet(cacheKey, data.roll_call, TTL.LEGISCAN_ROLLCALL)
  return data.roll_call
}
