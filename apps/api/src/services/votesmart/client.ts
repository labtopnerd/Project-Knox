/**
 * VoteSmart API client
 * Documentation: https://api.votesmart.org/docs
 * Register for a free key: https://votesmart.org/share/api
 *
 * Used for local government officials (mayor, city council, county commissioners, etc.)
 */

import axios from 'axios'
import { cacheGet, cacheSet } from '../../lib/redis'

const BASE_URL = 'https://api.votesmart.org'
const CACHE_TTL_SECONDS = 6 * 60 * 60 // 6 hours

function getApiKey(): string {
  const key = process.env.VOTESMART_API_KEY
  if (!key) throw new Error('VOTESMART_API_KEY environment variable is required')
  return key
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoteSmartOfficial {
  candidateId: string
  firstName: string
  lastName: string
  office: { name: string; typeId: string; level: string }
  phone?: string
  email?: string
  website?: string
  photo?: string
}

interface VoteSmartOfficialRaw {
  candidateId?: string
  firstName?: string
  lastName?: string
  office?: { name?: string; typeId?: string; level?: string }
  phone?: string
  email?: string
  website?: string
  photo?: string
}

interface VoteSmartByZipResponse {
  officials?: {
    official?: VoteSmartOfficialRaw | VoteSmartOfficialRaw[]
  }
  error?: { errorMessage?: string }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get officials for a given 5-digit ZIP code.
 * Filters to local-level offices only (office.level === 'Local').
 */
export async function getOfficialsByZip(zipCode: string): Promise<VoteSmartOfficial[]> {
  const cacheKey = `votesmart:officials:zip:${zipCode}`
  const cached = await cacheGet<VoteSmartOfficial[]>(cacheKey)
  if (cached) return cached

  const response = await axios.get<VoteSmartByZipResponse>(`${BASE_URL}/Officials.getByZip`, {
    params: {
      zip5: zipCode,
      key: getApiKey(),
      output: 'JSON',
    },
    timeout: 10000,
  })

  const data = response.data

  if (data.error) {
    // VoteSmart returns an error object (not HTTP error) when no officials found
    return []
  }

  const rawOfficials = data.officials?.official
  if (!rawOfficials) return []

  // VoteSmart wraps a single result as an object, multiple as an array
  const officialsArray = Array.isArray(rawOfficials) ? rawOfficials : [rawOfficials]

  const localOfficials: VoteSmartOfficial[] = officialsArray
    .filter((o): o is VoteSmartOfficialRaw & { candidateId: string; firstName: string; lastName: string; office: { name: string; typeId: string; level: string } } =>
      !!o.candidateId &&
      !!o.firstName &&
      !!o.lastName &&
      !!o.office &&
      o.office.level === 'Local',
    )
    .map((o) => ({
      candidateId: o.candidateId,
      firstName: o.firstName,
      lastName: o.lastName,
      office: { name: o.office.name, typeId: o.office.typeId, level: o.office.level },
      phone: o.phone || undefined,
      email: o.email || undefined,
      website: o.website || undefined,
      photo: o.photo || undefined,
    }))

  await cacheSet(cacheKey, localOfficials, CACHE_TTL_SECONDS)
  return localOfficials
}
