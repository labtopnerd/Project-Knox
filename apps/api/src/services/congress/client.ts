/**
 * Congress.gov API v3 client
 * Documentation: https://github.com/LibraryOfCongress/api.congress.gov
 * Free API key: https://api.congress.gov/sign-up/
 * Rate limit: 5,000 requests/hour
 */

import axios from 'axios'
import { cacheGet, cacheSet, TTL } from '../../lib/redis'

const BASE_URL = 'https://api.congress.gov/v3'

function getApiKey(): string {
  const key = process.env.CONGRESS_API_KEY
  if (!key) throw new Error('CONGRESS_API_KEY environment variable is required')
  return key
}

async function congressRequest<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const cacheKey = `congress:${path}:${JSON.stringify(params)}`
  const cached = await cacheGet<T>(cacheKey)
  if (cached) return cached

  const response = await axios.get<T>(`${BASE_URL}${path}`, {
    params: { api_key: getApiKey(), format: 'json', ...params },
    timeout: 15000,
  })

  await cacheSet(cacheKey, response.data, TTL.BILLS_LIST)
  return response.data
}

// ─── Bills ────────────────────────────────────────────────────────────────────

export interface CongressBillsResponse {
  bills: CongressBill[]
  pagination: { count: number; next?: string }
}

export interface CongressBill {
  congress: number
  type: string
  number: string
  title: string
  latestAction: { actionDate: string; text: string }
  updateDate: string
  url: string
  originChamber: string
  introducedDate: string
}

export interface CongressBillDetailResponse {
  bill: CongressBillDetail
}

export interface CongressBillDetail extends CongressBill {
  sponsors: Array<{ bioguideId: string; fullName: string; party: string; state: string }>
  cosponsors: { count: number; url: string }
  committees: { count: number; url: string }
  summaries: { count: number; url: string }
  subjects: { count: number; url: string }
  cboCostEstimates: Array<{ description: string; pubDate: string; url: string }>
  policyArea?: { name: string }
  actions: { count: number; url: string }
  relatedBills?: { count: number; url: string }
}

export interface CongressAction {
  actionDate: string
  text: string
  type?: string
  actionCode?: string
}

export interface CongressRelatedBill {
  title: string
  congress: number
  type: string
  number: string
  url: string
  relationshipDetails: Array<{ type: string; identifiedBy: string }>
}

export interface CongressBillSummariesResponse {
  summaries: Array<{
    actionDate: string
    actionDesc: string
    text: string
    updateDate: string
    versionCode: string
  }>
}

export interface CongressMembersResponse {
  members: CongressMember[]
  pagination: { count: number; next?: string }
}

export interface CongressMember {
  bioguideId: string
  name: string
  state: string
  district?: number
  party: string
  chamber: string
  terms: { item: Array<{ chamber: string; startYear: number; endYear?: number }> }
  updateDate: string
  url: string
  depiction?: { imageUrl: string; attributionUrl: string }
  currentMember: boolean
}

export interface CongressMemberDetailResponse {
  member: CongressMemberDetail
}

export interface CongressMemberDetail extends CongressMember {
  officialWebsiteUrl?: string
  addressInformation?: {
    city: string
    district: string
    officeAddress: string
    phoneNumber: string
    zipCode: number
  }
  partyHistory: Array<{ partyAbbreviation: string; partyName: string; startYear: number }>
  sponsoredLegislation: { count: number; url: string }
  cosponsoredLegislation: { count: number; url: string }
}

/**
 * Fetch recent bills from Congress.gov sorted by update date.
 */
export async function getRecentBills(
  congress: number = 119,
  offset: number = 0,
  limit: number = 20,
  fromDateTime?: string,
): Promise<CongressBillsResponse> {
  const params: Record<string, string | number> = {
    limit,
    offset,
    sort: 'updateDate+desc',
  }
  if (fromDateTime) {
    params.fromDateTime = fromDateTime
  }
  return congressRequest<CongressBillsResponse>(`/bill/${congress}`, params)
}

/**
 * Fetch bill detail including sponsor, summary, and subjects.
 */
export async function getBillDetail(
  congress: number,
  type: string,
  number: string,
): Promise<CongressBillDetailResponse> {
  const cacheKey = `congress:bill:${congress}:${type}:${number}`
  const cached = await cacheGet<CongressBillDetailResponse>(cacheKey)
  if (cached) return cached

  const response = await axios.get<CongressBillDetailResponse>(
    `${BASE_URL}/bill/${congress}/${type.toLowerCase()}/${number}`,
    { params: { api_key: getApiKey(), format: 'json' }, timeout: 15000 },
  )

  await cacheSet(cacheKey, response.data, TTL.BILL_DETAIL)
  return response.data
}

/**
 * Fetch bill summaries.
 */
export async function getBillSummaries(
  congress: number,
  type: string,
  number: string,
): Promise<CongressBillSummariesResponse> {
  return congressRequest<CongressBillSummariesResponse>(
    `/bill/${congress}/${type.toLowerCase()}/${number}/summaries`,
  )
}

/**
 * Fetch all current members of Congress (optionally filtered by state/district/chamber).
 */
export async function getMembers(params: {
  stateCode?: string
  district?: number
  chamber?: 'House' | 'Senate'
  currentMember?: boolean
  offset?: number
  limit?: number
}): Promise<CongressMembersResponse> {
  const queryParams: Record<string, string | number> = {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  }
  if (params.stateCode) queryParams.stateCode = params.stateCode
  if (params.district) queryParams.district = params.district
  if (params.chamber) queryParams.chamber = params.chamber
  if (params.currentMember !== undefined) queryParams.currentMember = params.currentMember ? 'true' : 'false'

  return congressRequest<CongressMembersResponse>('/member', queryParams)
}

/**
 * Fetch a single member's detail by bioguideId.
 */
export async function getMemberDetail(bioguideId: string): Promise<CongressMemberDetailResponse> {
  const cacheKey = `congress:member:${bioguideId}`
  const cached = await cacheGet<CongressMemberDetailResponse>(cacheKey)
  if (cached) return cached

  const response = await axios.get<CongressMemberDetailResponse>(
    `${BASE_URL}/member/${bioguideId}`,
    { params: { api_key: getApiKey(), format: 'json' }, timeout: 15000 },
  )

  await cacheSet(cacheKey, response.data, TTL.REPS_BY_ID)
  return response.data
}

/**
 * Fetch bills sponsored by a specific member.
 */
export async function getMemberSponsoredBills(bioguideId: string, offset: number = 0): Promise<CongressBillsResponse> {
  return congressRequest<CongressBillsResponse>(`/member/${bioguideId}/sponsored-legislation`, {
    limit: 20,
    offset,
  })
}

/**
 * Fetch the legislative action history for a bill.
 */
export async function getBillActions(
  congress: number,
  type: string,
  number: string,
): Promise<CongressAction[]> {
  const data = await congressRequest<{ actions: CongressAction[] }>(
    `/bill/${congress}/${type.toLowerCase()}/${number}/actions`,
    { limit: 50 },
  )
  return data.actions ?? []
}

/**
 * Fetch related bills for a given bill.
 */
export async function getRelatedBills(
  congress: number,
  type: string,
  number: string,
): Promise<CongressRelatedBill[]> {
  const data = await congressRequest<{ relatedBills: CongressRelatedBill[] }>(
    `/bill/${congress}/${type.toLowerCase()}/${number}/relatedbills`,
  )
  return data.relatedBills ?? []
}
