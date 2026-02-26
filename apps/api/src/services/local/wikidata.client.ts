/**
 * Wikidata SPARQL API — Free local officials lookup
 *
 * Wikidata's WikiProject "Every Politician" maintains data on elected officials
 * worldwide, including US mayors, city council members, county commissioners, etc.
 * Coverage is community-maintained — major cities are well covered; small localities vary.
 *
 * No API key required. Free and unlimited.
 * Documentation: https://www.wikidata.org/wiki/Wikidata:WikiProject_every_politician
 * SPARQL endpoint: https://query.wikidata.org/sparql
 */

import axios from 'axios'
import { cacheGet, cacheSet, TTL } from '../../lib/redis'

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'

interface WikidataOfficial {
  name: string
  role: string
  jurisdiction: string
  jurisdictionLabel: string
  partyLabel: string
  startDate: string | null
  email: string | null
  websiteUrl: string | null
  wikidataId: string
  image: string | null
}

interface WikidataSPARQLBinding {
  type: string
  value: string
}

interface WikidataSPARQLResult {
  results: {
    bindings: Array<Record<string, WikidataSPARQLBinding>>
  }
}

/**
 * Look up local officials for a given US city by city name and state.
 * Returns mayors, city council members, county executives, etc.
 *
 * Note: This covers major US cities well. Coverage decreases for smaller localities.
 */
export async function getLocalOfficialsByCity(
  city: string,
  stateCode: string,
): Promise<WikidataOfficial[]> {
  const cacheKey = `wikidata:city:${stateCode.toLowerCase()}:${city.toLowerCase().replace(/\s+/g, '_')}`
  const cached = await cacheGet<WikidataOfficial[]>(cacheKey)
  if (cached) return cached

  // SPARQL query: Find current office-holders for US city/county positions
  const sparql = `
    SELECT DISTINCT ?official ?officialLabel ?role ?roleLabel ?jurisdiction ?jurisdictionLabel ?party ?partyLabel ?start ?email ?website ?image WHERE {
      # Find the city/locality in Wikidata
      ?jurisdiction wdt:P17 wd:Q30 ;  # country = United States
                    wdt:P131* ?state .  # located in administrative territorial entity
      ?state wdt:P297 "${stateCode.toUpperCase()}" .  # state ISO code
      FILTER(REGEX(?jurisdictionLabel, "^${city}$", "i"))

      # Find current officeholders
      ?official p:P39 ?positionStatement .
      ?positionStatement ps:P39 ?role ;
                          pq:P17 ?jurisdiction .
      OPTIONAL { ?positionStatement pq:P580 ?start }
      OPTIONAL { ?positionStatement pq:P582 ?end }
      FILTER(!BOUND(?end) || ?end > NOW())

      # Party affiliation
      OPTIONAL { ?official wdt:P102 ?party }

      # Contact info
      OPTIONAL { ?official wdt:P968 ?email }
      OPTIONAL { ?official wdt:P856 ?website }
      OPTIONAL { ?official wdt:P18 ?image }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    LIMIT 50
  `

  try {
    const response = await axios.get<WikidataSPARQLResult>(SPARQL_ENDPOINT, {
      params: { query: sparql, format: 'json' },
      headers: {
        'User-Agent': 'ProjectKnox/1.0 (civic engagement app; https://github.com/labtopnerd/Project-Knox)',
        Accept: 'application/sparql-results+json',
      },
      timeout: 15000,
    })

    const officials = response.data.results.bindings.map((binding) => ({
      name: binding.officialLabel?.value ?? '',
      role: binding.roleLabel?.value ?? '',
      jurisdiction: binding.jurisdiction?.value ?? '',
      jurisdictionLabel: binding.jurisdictionLabel?.value ?? '',
      partyLabel: binding.partyLabel?.value ?? '',
      startDate: binding.start?.value ?? null,
      email: binding.email?.value ?? null,
      websiteUrl: binding.website?.value ?? null,
      wikidataId: binding.official?.value?.replace('http://www.wikidata.org/entity/', '') ?? '',
      image: binding.image?.value ?? null,
    }))

    // Filter to relevant roles (mayor, council, commissioner, etc.)
    const localRoles = officials.filter((o) => {
      const role = o.role.toLowerCase()
      return (
        role.includes('mayor') ||
        role.includes('council') ||
        role.includes('commissioner') ||
        role.includes('supervisor') ||
        role.includes('alderman') ||
        role.includes('selectman') ||
        role.includes('trustee') ||
        role.includes('clerk') ||
        role.includes('treasurer') ||
        role.includes('comptroller') ||
        role.includes('executive')
      )
    })

    await cacheSet(cacheKey, localRoles, TTL.REPS_BY_ADDRESS)
    return localRoles
  } catch (err) {
    console.error('[Wikidata] SPARQL query error:', err)
    return []
  }
}

/**
 * Get the mayor of a US city.
 * Simplified query for single-official lookup.
 */
export async function getMayorByCity(
  city: string,
  stateCode: string,
): Promise<WikidataOfficial | null> {
  const officials = await getLocalOfficialsByCity(city, stateCode)
  return officials.find((o) => o.role.toLowerCase().includes('mayor')) ?? null
}
