/**
 * OpenStates API v3 client
 * Documentation: https://docs.openstates.org/api-v3/
 * Register for a free API key: https://open.pluralpolicy.com/
 * Rate limit: 500 queries/day (default) — request increases via contact@openstates.org
 *
 * OpenStates covers all 50 US states + DC + Puerto Rico.
 */

import axios from 'axios'
import { cacheGet, cacheSet, TTL } from '../../lib/redis'

const BASE_URL = 'https://v3.openstates.org'

function getApiKey(): string {
  const key = process.env.OPENSTATES_API_KEY
  if (!key) throw new Error('OPENSTATES_API_KEY environment variable is required')
  return key
}

const openStatesClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'X-API-KEY': '' }, // Set dynamically
})

openStatesClient.interceptors.request.use((config) => {
  config.headers['X-API-KEY'] = getApiKey()
  return config
})

async function openStatesRequest<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const cacheKey = `openstates:${path}:${JSON.stringify(params)}`
  const cached = await cacheGet<T>(cacheKey)
  if (cached) return cached

  const response = await openStatesClient.get<T>(path, { params })
  await cacheSet(cacheKey, response.data, TTL.BILLS_LIST)
  return response.data
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenStatesBillsResponse {
  results: OpenStatesBill[]
  pagination: { max_page: number; page: number; per_page: number; total_items: number }
}

export interface OpenStatesBill {
  id: string
  session: string
  identifier: string
  title: string
  classification: string[]
  subject: string[]
  extras: Record<string, unknown>
  created_at: string
  updated_at: string
  first_action_date: string | null
  latest_action_date: string | null
  latest_action_description: string | null
  latest_passage_date: string | null
  from_organization: { id: string; name: string; classification: string }
  abstracts?: Array<{ abstract: string; note?: string }>
  sponsorships?: Array<{
    person_id: string | null
    name: string
    classification: string
    primary: boolean
  }>
  actions?: Array<{ date: string; description: string; classification: string[] }>
  versions?: Array<{ url: string; note: string; media_type: string }>
  openstates_url: string
}

export interface OpenStatesPeopleResponse {
  results: OpenStatesPerson[]
  pagination: { max_page: number; page: number; per_page: number; total_items: number }
}

export interface OpenStatesPerson {
  id: string
  name: string
  party: string
  current_role: {
    title: string
    org_classification: string
    district: string
    division_id: string
  } | null
  jurisdiction: { id: string; name: string; classification: string }
  given_name: string
  family_name: string
  image: string
  email: string | null
  links: Array<{ url: string; note: string }>
  extras: Record<string, unknown>
  created_at: string
  updated_at: string
  openstates_url: string
}

// ─── Bills ────────────────────────────────────────────────────────────────────

/**
 * Search state bills. Use jurisdiction to filter by state (e.g., "ca" for California).
 * OpenStates jurisdiction codes are lowercase state abbreviations.
 */
export async function searchBills(params: {
  jurisdiction?: string  // e.g. "ca", "ny", "tx"
  session?: string
  query?: string
  classification?: string
  subject?: string
  updatedSince?: string  // ISO 8601 datetime
  page?: number
  perPage?: number
  include?: string[]    // ["sponsorships", "abstracts", "actions", "versions"]
}): Promise<OpenStatesBillsResponse> {
  const queryParams: Record<string, string | number | boolean> = {
    page: params.page ?? 1,
    per_page: params.perPage ?? 20,
  }
  if (params.jurisdiction) queryParams.jurisdiction = params.jurisdiction
  if (params.session) queryParams.session = params.session
  if (params.query) queryParams.q = params.query
  if (params.classification) queryParams.classification = params.classification
  if (params.subject) queryParams.subject = params.subject
  if (params.updatedSince) queryParams.updated_since = params.updatedSince
  if (params.include && params.include.length > 0) queryParams.include = params.include.join(',')

  return openStatesRequest<OpenStatesBillsResponse>('/bills', queryParams)
}

/**
 * Fetch all bills updated since a given date for a jurisdiction.
 * Used for incremental syncing.
 */
export async function getBillsUpdatedSince(jurisdiction: string, since: Date): Promise<OpenStatesBill[]> {
  const allBills: OpenStatesBill[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const response = await searchBills({
      jurisdiction,
      updatedSince: since.toISOString(),
      page,
      perPage: 100,
      include: ['sponsorships', 'abstracts', 'actions'],
    })
    allBills.push(...response.results)
    hasMore = page < response.pagination.max_page
    page++
  }

  return allBills
}

// ─── People / Representatives ─────────────────────────────────────────────────

/**
 * Find state legislators by latitude/longitude.
 * This is the primary way to find a user's state legislators from their address.
 */
export async function getPeopleByLocation(lat: number, lng: number): Promise<OpenStatesPeopleResponse> {
  const cacheKey = `openstates:people:geo:${lat.toFixed(4)}:${lng.toFixed(4)}`
  const cached = await cacheGet<OpenStatesPeopleResponse>(cacheKey)
  if (cached) return cached

  const response = await openStatesClient.get<OpenStatesPeopleResponse>('/people.geo', {
    params: { lat, lng, include: 'links' },
  })

  await cacheSet(cacheKey, response.data, TTL.REPS_BY_ADDRESS)
  return response.data
}

/**
 * Get all current legislators for a jurisdiction (state).
 */
export async function getPeopleByJurisdiction(
  jurisdiction: string,
  include: string[] = ['links'],
): Promise<OpenStatesPeopleResponse> {
  return openStatesRequest<OpenStatesPeopleResponse>('/people', {
    jurisdiction,
    include: include.join(','),
    per_page: 50,
  })
}

/**
 * Get a single person by OpenStates ID.
 */
export async function getPersonById(personId: string): Promise<OpenStatesPerson> {
  const cacheKey = `openstates:person:${personId}`
  const cached = await cacheGet<OpenStatesPerson>(cacheKey)
  if (cached) return cached

  const response = await openStatesClient.get<OpenStatesPerson>(`/people/${personId}`, {
    params: { include: 'links' },
  })

  await cacheSet(cacheKey, response.data, TTL.REPS_BY_ID)
  return response.data
}
