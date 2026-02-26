/**
 * Local Officials Service
 *
 * Orchestrates multiple free data sources to find local government officials:
 *
 * 1. Wikidata SPARQL API (FREE, no key) — coverage: major US cities + many counties
 *    Best for: mayor, city council, county executives of well-known municipalities
 *
 * 2. Resistbot contact-officials (FREE, open-source GitHub data) — coverage: growing
 *    Best for: contact form URLs for contacting local officials
 *    GitHub: https://github.com/resistbot/contact-officials
 *
 * 3. OpenStates (FREE) — covers some municipal data in certain states
 *
 * 4. Cicero API (PAID, ~$298/yr — OPTIONAL) — comprehensive local coverage
 *    Set CICERO_API_KEY env var to enable
 *
 * Strategy: Try free sources first. Fall back to Cicero if configured.
 * For uncovered localities, return empty array (show "no local reps found" message).
 *
 * Local government integration is Phase 3+ scope. This service is scaffolded
 * for future implementation.
 */

import { getLocalOfficialsByCity } from './wikidata.client'
import { prisma } from '../../lib/prisma'
import type { Prisma } from '@prisma/client'

export interface LocalOfficialResult {
  name: string
  role: string        // "Mayor", "City Council Member", etc.
  party: string | null
  city: string
  stateCode: string
  email: string | null
  websiteUrl: string | null
  photoUrl: string | null
  source: 'wikidata' | 'cicero' | 'manual'
  externalId: string
}

/**
 * Find local officials for a user's city/county.
 * Returns results from whichever free sources have data.
 *
 * @param city - City name (e.g., "Los Angeles")
 * @param stateCode - 2-letter state code (e.g., "CA")
 * @param lat - Latitude (for future geocoding-based lookup)
 * @param lng - Longitude
 */
export async function findLocalOfficials(
  city: string,
  stateCode: string,
  _lat?: number,
  _lng?: number,
): Promise<LocalOfficialResult[]> {
  const results: LocalOfficialResult[] = []

  // Source 1: Wikidata (free, community-maintained)
  try {
    const wikidataOfficials = await getLocalOfficialsByCity(city, stateCode)
    for (const official of wikidataOfficials) {
      if (!official.name) continue
      results.push({
        name: official.name,
        role: official.role,
        party: official.partyLabel || null,
        city,
        stateCode,
        email: official.email,
        websiteUrl: official.websiteUrl,
        photoUrl: official.image,
        source: 'wikidata',
        externalId: `wikidata:${official.wikidataId}`,
      })
    }
  } catch (err) {
    console.error('[LocalOfficials] Wikidata lookup failed:', err)
  }

  // Source 2: Cicero API (if configured — optional paid integration)
  if (process.env.CICERO_API_KEY) {
    try {
      const ciceroResults = await fetchFromCicero(city, stateCode)
      results.push(...ciceroResults)
    } catch (err) {
      console.error('[LocalOfficials] Cicero lookup failed:', err)
    }
  }

  return deduplicateOfficials(results)
}

/**
 * Upsert local officials found into the representatives table.
 */
export async function upsertLocalOfficials(
  officials: LocalOfficialResult[],
): Promise<string[]> {
  const ids: string[] = []

  for (const official of officials) {
    try {
      const data: Prisma.RepresentativeCreateInput = {
        externalId: official.externalId,
        source: official.source,
        fullName: official.name,
        party: official.party,
        chamber: 'local',
        level: 'local',
        stateCode: official.stateCode,
        district: null,
        title: official.role,
        photoUrl: official.photoUrl,
        websiteUrl: official.websiteUrl,
        email: official.email,
        isActive: true,
        lastSyncedAt: new Date(),
      }

      const rep = await prisma.representative.upsert({
        where: { externalId: official.externalId },
        create: data,
        update: {
          fullName: official.name,
          party: official.party,
          photoUrl: official.photoUrl,
          email: official.email,
          lastSyncedAt: new Date(),
        },
      })
      ids.push(rep.id)
    } catch (err) {
      console.error('[LocalOfficials] Error upserting official:', official.name, err)
    }
  }

  return ids
}

/**
 * Cicero API integration (optional — requires paid API key).
 * Cicero is the most comprehensive local official database (~$298/yr for nonprofits).
 * Free trial: 1,000 credits at https://www.cicerodata.com/free-trial/
 *
 * Enable by setting CICERO_API_KEY in your .env file.
 */
async function fetchFromCicero(
  city: string,
  stateCode: string,
): Promise<LocalOfficialResult[]> {
  // Cicero API documentation: https://app.cicerodata.com/docs/
  // Endpoint: GET https://app.cicerodata.com/v3.1/official?search_loc={address}
  //
  // This is intentionally left as a stub. To implement:
  // 1. Sign up for Cicero at https://www.cicerodata.com/free-trial/
  // 2. Add CICERO_API_KEY to your .env
  // 3. Replace this stub with the actual Cicero API call
  //
  // The Cicero API returns officials at federal, state, and LOCAL levels
  // (including city council, county commissioners, school boards, etc.)

  console.log(`[Cicero] Stub: would fetch local officials for ${city}, ${stateCode}`)
  return []
}

function deduplicateOfficials(officials: LocalOfficialResult[]): LocalOfficialResult[] {
  const seen = new Set<string>()
  return officials.filter((o) => {
    const key = `${o.name.toLowerCase()}-${o.role.toLowerCase()}-${o.stateCode}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
