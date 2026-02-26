/**
 * US Census Bureau Geocoding API client
 * Documentation: https://geocoding.geo.census.gov/geocoder/
 * FREE — No API key required. No rate limits documented.
 *
 * This service converts a user's address into lat/lng coordinates and
 * congressional district FIPS codes, enabling precise representative lookup.
 */

import axios from 'axios'
import { cacheGet, cacheSet, TTL } from '../../lib/redis'

const BASE_URL = 'https://geocoding.geo.census.gov/geocoder'

export interface CensusGeocodeResult {
  latitude: number
  longitude: number
  stateCode: string  // 2-letter e.g. "CA"
  stateFips: string  // e.g. "06"
  countyFips: string // e.g. "06037"
  tractCode: string
  blockCode: string
  congressionalDistrict: string  // e.g. "12" (116th Congress)
  stateDistrict: string          // state legislative district (upper)
  stateDistrictLower: string     // state legislative district (lower)
  matchedAddress: string
}

export interface CensusGeocodeResponse {
  result: {
    input: { address: { address: string } }
    addressMatches: Array<{
      matchedAddress: string
      coordinates: { x: number; y: number }  // x = lng, y = lat
      geographies?: {
        '116th Congressional Districts'?: Array<{ BASENAME: string; GEOID: string; CD116FP: string }>
        'Current Congressional Districts'?: Array<{ BASENAME: string; GEOID: string; CDFP: string }>
        'States'?: Array<{ BASENAME: string; GEOID: string; STUSAB: string; STATE: string }>
        'State Legislative Districts - Upper'?: Array<{ BASENAME: string; SLDUST: string }>
        'State Legislative Districts - Lower'?: Array<{ BASENAME: string; SLDLST: string }>
      }
    }>
  }
}

const STATE_FIPS_TO_CODE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
}

/**
 * Geocode a full address string and return coordinates + district information.
 * Returns null if the address cannot be matched.
 */
export async function geocodeAddress(address: string): Promise<CensusGeocodeResult | null> {
  const cacheKey = `census:geocode:${address.toLowerCase().replace(/\s+/g, ' ').trim()}`
  const cached = await cacheGet<CensusGeocodeResult>(cacheKey)
  if (cached) return cached

  try {
    const response = await axios.get<CensusGeocodeResponse>(`${BASE_URL}/locations/onelineaddress`, {
      params: {
        address,
        benchmark: 'Public_AR_Current',
        vintage: 'Current_Current',
        layers: 'all',
        format: 'json',
      },
      timeout: 10000,
    })

    const matches = response.data.result.addressMatches
    if (!matches || matches.length === 0) return null

    const match = matches[0]!
    const geographies = match.geographies ?? {}

    const stateInfo =
      geographies['States']?.[0] ?? null
    const stateFips = stateInfo?.STATE ?? ''
    const stateCode = stateInfo?.STUSAB ?? STATE_FIPS_TO_CODE[stateFips] ?? ''

    const cdInfo =
      geographies['Current Congressional Districts']?.[0] ??
      geographies['116th Congressional Districts']?.[0] ??
      null

    const districtNum = cdInfo?.CDFP ?? cdInfo?.CD116FP ?? ''
    const congressionalDistrict = districtNum ? String(parseInt(districtNum, 10)) : ''

    const upperDist = geographies['State Legislative Districts - Upper']?.[0]?.SLDUST ?? ''
    const lowerDist = geographies['State Legislative Districts - Lower']?.[0]?.SLDLST ?? ''

    const result: CensusGeocodeResult = {
      latitude: match.coordinates.y,
      longitude: match.coordinates.x,
      stateCode,
      stateFips,
      countyFips: '',
      tractCode: '',
      blockCode: '',
      congressionalDistrict,
      stateDistrict: upperDist,
      stateDistrictLower: lowerDist,
      matchedAddress: match.matchedAddress,
    }

    await cacheSet(cacheKey, result, TTL.CENSUS_GEOCODE)
    return result
  } catch (err) {
    console.error('[Census] Geocoding error:', err)
    return null
  }
}

/**
 * Geocode using zip code only (less precise — gives state but not district).
 * Use this as a fallback when full address geocoding fails.
 */
export async function geocodeZipCode(zipCode: string): Promise<Partial<CensusGeocodeResult> | null> {
  const cacheKey = `census:zip:${zipCode}`
  const cached = await cacheGet<Partial<CensusGeocodeResult>>(cacheKey)
  if (cached) return cached

  try {
    const response = await axios.get<CensusGeocodeResponse>(`${BASE_URL}/locations/onelineaddress`, {
      params: {
        address: zipCode,
        benchmark: 'Public_AR_Current',
        vintage: 'Current_Current',
        layers: 'all',
        format: 'json',
      },
      timeout: 10000,
    })

    const matches = response.data.result.addressMatches
    if (!matches || matches.length === 0) return null

    const match = matches[0]!
    const stateInfo = match.geographies?.['States']?.[0] ?? null
    const stateFips = stateInfo?.STATE ?? ''
    const stateCode = stateInfo?.STUSAB ?? STATE_FIPS_TO_CODE[stateFips] ?? ''

    const result: Partial<CensusGeocodeResult> = {
      latitude: match.coordinates.y,
      longitude: match.coordinates.x,
      stateCode,
      stateFips,
      matchedAddress: match.matchedAddress,
    }

    await cacheSet(cacheKey, result, TTL.CENSUS_GEOCODE)
    return result
  } catch {
    return null
  }
}
