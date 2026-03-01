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
      geographies?: Record<string, Array<Record<string, string>>>
    }>
  }
}

export interface CensusCoordinatesResponse {
  result: {
    geographies: Record<string, Array<Record<string, string>>>
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
 * Extract district info from a Census geographies object.
 * Layer names change each Congress — probe multiple known names.
 */
function extractDistrictsFromGeographies(
  geo: Record<string, Array<Record<string, string>>>,
): { stateCode: string; stateFips: string; congressionalDistrict: string; stateDistrict: string; stateDistrictLower: string } {
  const stateInfo = geo['States']?.[0] ?? {}
  const stateFips = stateInfo['STATE'] ?? ''
  const stateCode = stateInfo['STUSAB'] ?? STATE_FIPS_TO_CODE[stateFips] ?? ''

  // Congressional district — probe current and past layer names
  const cdLayerNames = [
    '119th Congressional Districts',
    '118th Congressional Districts',
    'Current Congressional Districts',
    '116th Congressional Districts',
  ]
  let cdInfo: Record<string, string> | undefined
  for (const name of cdLayerNames) {
    if (geo[name]?.[0]) { cdInfo = geo[name]![0]; break }
  }
  const districtNum = cdInfo?.['CDFP'] ?? cdInfo?.['CD116FP'] ?? ''
  const congressionalDistrict = districtNum ? String(parseInt(districtNum, 10)) : ''

  // State legislative districts — probe current and past layer names
  const upperLayerNames = ['2024 State Legislative Districts - Upper', 'State Legislative Districts - Upper']
  const lowerLayerNames = ['2024 State Legislative Districts - Lower', 'State Legislative Districts - Lower']
  let upperInfo: Record<string, string> | undefined
  for (const name of upperLayerNames) {
    if (geo[name]?.[0]) { upperInfo = geo[name]![0]; break }
  }
  let lowerInfo: Record<string, string> | undefined
  for (const name of lowerLayerNames) {
    if (geo[name]?.[0]) { lowerInfo = geo[name]![0]; break }
  }
  const stateDistrict = upperInfo?.['SLDUST'] ?? upperInfo?.['BASENAME'] ?? ''
  const stateDistrictLower = lowerInfo?.['SLDLST'] ?? lowerInfo?.['BASENAME'] ?? ''

  return { stateCode, stateFips, congressionalDistrict, stateDistrict, stateDistrictLower }
}

/**
 * Look up Census geographies by coordinates. Used by geocodeZipCode.
 */
async function geocodeByCoordinates(
  lat: number,
  lng: number,
): Promise<{ stateCode: string; stateFips: string; congressionalDistrict: string; stateDistrict: string; stateDistrictLower: string } | null> {
  try {
    const response = await axios.get<CensusCoordinatesResponse>(
      `${BASE_URL}/geographies/coordinates`,
      {
        params: { x: lng, y: lat, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: 'all', format: 'json' },
        timeout: 10000,
      },
    )
    const geo = response.data.result.geographies ?? {}
    return extractDistrictsFromGeographies(geo)
  } catch (err) {
    console.error('[Census] Coordinates lookup error:', err)
    return null
  }
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
    const districts = extractDistrictsFromGeographies(match.geographies ?? {})

    const result: CensusGeocodeResult = {
      latitude: match.coordinates.y,
      longitude: match.coordinates.x,
      ...districts,
      countyFips: '',
      tractCode: '',
      blockCode: '',
      matchedAddress: match.matchedAddress,
    }

    await cacheSet(cacheKey, result, TTL.CENSUS_GEOCODE)
    return result
  } catch (err) {
    console.error('[Census] Geocoding error:', err)
    return null
  }
}

interface ZippopotamPlace {
  'place name': string
  longitude: string
  state: string
  'state abbreviation': string
  latitude: string
}

/**
 * Geocode using ZIP code only.
 * Uses zippopotam.us (free, no key) to get the ZIP centroid lat/lng,
 * then calls the Census coordinates endpoint to get the congressional district.
 */
export async function geocodeZipCode(zipCode: string): Promise<Partial<CensusGeocodeResult> | null> {
  const cacheKey = `census:zip:${zipCode}`
  const cached = await cacheGet<Partial<CensusGeocodeResult>>(cacheKey)
  if (cached) return cached

  try {
    // Step 1: Resolve ZIP → lat/lng + state via zippopotam.us (free, no key required)
    const zipResp = await axios.get<{ places: ZippopotamPlace[] }>(
      `https://api.zippopotam.us/us/${zipCode}`,
      { timeout: 8000 },
    )
    const place = zipResp.data.places[0]
    if (!place) return null

    const lat = parseFloat(place.latitude)
    const lng = parseFloat(place.longitude)
    const stateCode = place['state abbreviation']
    const matchedAddress = `${place['place name']}, ${stateCode} ${zipCode}`

    // Step 2: Get congressional district from Census by coordinates
    const districts = await geocodeByCoordinates(lat, lng)

    const result: Partial<CensusGeocodeResult> = {
      latitude: lat,
      longitude: lng,
      stateCode,
      stateFips: districts?.stateFips ?? '',
      congressionalDistrict: districts?.congressionalDistrict ?? '',
      stateDistrict: districts?.stateDistrict ?? '',
      stateDistrictLower: districts?.stateDistrictLower ?? '',
      matchedAddress,
    }

    await cacheSet(cacheKey, result, TTL.CENSUS_GEOCODE)
    return result
  } catch {
    return null
  }
}
