/**
 * Backfills photoUrl for federal representatives using bioguide IDs.
 *
 * Photo source: https://theunitedstates.io/images/congress/225x275/{bioguideId}.jpg
 *
 * Bioguide ID sources (both free, no API key):
 *   Primary: unitedstates.github.io/congress-legislators/legislators-current.json
 *            Covers all current House + Senate members with bioguide IDs
 *   Supplement: One House Clerk XML — https://clerk.house.gov/evs/{year}/roll001.xml
 *               Ensures current members not yet in the legislators JSON are covered
 *
 * Only updates reps whose photoUrl is currently null.
 *
 * Run with:
 *   npx tsx src/scripts/backfillFederalPhotos.ts
 *   DRY_RUN=1 npx tsx src/scripts/backfillFederalPhotos.ts
 */

import 'dotenv/config'
import axios from 'axios'
import { prisma } from '../lib/prisma'

const DRY_RUN = process.env.DRY_RUN === '1'
const PHOTO_BASE = 'https://unitedstates.github.io/images/congress/225x275'

interface UnitedStatesLegislator {
  id: { bioguide: string }
  name: { last: string }
  terms: Array<{ type: 'rep' | 'sen'; state: string; party: string }>
}

// ─── Build bioguide lookup maps ────────────────────────────────────────────────

/**
 * Builds bioguide lookup maps from unitedstates.github.io legislators JSON.
 * Returns:
 *   houseMap:  Map<"lastName:stateCode:partyAbbr", bioguideId>
 *   senateMap: Map<"lastName:stateCode",           bioguideId>
 */
async function buildBioguideMapFromJson(): Promise<{
  houseMap: Map<string, string>
  senateMap: Map<string, string>
}> {
  const { data } = await axios.get<UnitedStatesLegislator[]>(
    'https://unitedstates.github.io/congress-legislators/legislators-current.json',
    { timeout: 30000 },
  )

  const houseMap = new Map<string, string>()
  const senateMap = new Map<string, string>()

  for (const leg of data) {
    const latest = leg.terms[leg.terms.length - 1]
    if (!latest) continue
    const lastName = leg.name.last.toLowerCase()
    const state = latest.state.toLowerCase()
    const p = latest.party.toLowerCase()
    const partyAbbr = p === 'democrat' ? 'd' : p === 'republican' ? 'r' : 'i'

    if (latest.type === 'sen') {
      senateMap.set(`${lastName}:${state}`, leg.id.bioguide)
    } else {
      houseMap.set(`${lastName}:${state}:${partyAbbr}`, leg.id.bioguide)
    }
  }

  console.log(`[BioguideMap] JSON: ${houseMap.size} house, ${senateMap.size} senate`)
  return { houseMap, senateMap }
}

/**
 * Supplements the house map with bioguide IDs from the House Clerk XML.
 * The XML is the authoritative source for the current session.
 */
async function supplementHouseMapFromXml(houseMap: Map<string, string>): Promise<void> {
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1]

  for (const year of years) {
    try {
      const { data: xml, status } = await axios.get<string>(
        `https://clerk.house.gov/evs/${year}/roll001.xml`,
        { timeout: 15000, responseType: 'text', validateStatus: (s) => s < 500 },
      )
      if (status !== 200 || typeof xml !== 'string' || !xml.includes('<rollcall-vote>')) continue

      let added = 0
      for (const block of xml.matchAll(/<recorded-vote>[\s\S]*?<\/recorded-vote>/g)) {
        const tag = block[0]!
        const bioguideId = tag.match(/name-id="([^"]+)"/)?.[1]
        const lastName = tag.match(/sort-field="([^"]+)"/)?.[1]
        const party = tag.match(/party="([^"]+)"/)?.[1]
        const state = tag.match(/state="([^"]+)"/)?.[1]
        if (!bioguideId || !lastName || !party || !state) continue

        const key = `${lastName.toLowerCase()}:${state.toLowerCase()}:${party.toLowerCase()}`
        if (!houseMap.has(key)) {
          houseMap.set(key, bioguideId)
          added++
        }
      }
      console.log(`[BioguideMap] XML ${year}: ${added} new house entries added`)
      break
    } catch {
      // try next year
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('[FederalPhotos] *** DRY_RUN mode ***\n')

  const { houseMap, senateMap } = await buildBioguideMapFromJson()
  await supplementHouseMapFromXml(houseMap)

  const reps = await prisma.representative.findMany({
    where: { level: 'federal', photoUrl: null },
    select: { id: true, fullName: true, stateCode: true, party: true, chamber: true },
  })
  console.log(`[FederalPhotos] ${reps.length} federal reps without photos`)

  let updated = 0
  let unmatched = 0

  for (const rep of reps) {
    const parts = rep.fullName.trim().split(' ')
    const lastName = parts[parts.length - 1]?.toLowerCase() ?? ''
    const state = rep.stateCode?.toLowerCase() ?? ''
    const p = (rep.party ?? '').toLowerCase()
    const partyAbbr = p === 'democrat' || p === 'd' ? 'd' : p === 'republican' || p === 'r' ? 'r' : 'i'

    let bioguideId: string | undefined

    if (rep.chamber === 'house') {
      bioguideId = houseMap.get(`${lastName}:${state}:${partyAbbr}`)
    } else if (rep.chamber === 'senate') {
      bioguideId = senateMap.get(`${lastName}:${state}`)
    }

    if (!bioguideId) {
      if (DRY_RUN) console.log(`  UNMATCHED: ${rep.fullName} (${rep.chamber}, ${rep.stateCode}, ${rep.party})`)
      unmatched++
      continue
    }

    const photoUrl = `${PHOTO_BASE}/${bioguideId}.jpg`

    if (!DRY_RUN) {
      await prisma.representative.update({ where: { id: rep.id }, data: { photoUrl } })
    } else {
      console.log(`  ${rep.fullName} → ${photoUrl}`)
    }
    updated++
  }

  console.log(`[FederalPhotos] Updated ${updated}, unmatched ${unmatched} / ${reps.length} total`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
