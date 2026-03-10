import 'dotenv/config'
import axios from 'axios'
import { prisma } from '../lib/prisma'

async function main() {
  const { data } = await axios.get<Array<{
    id: { bioguide: string }
    name: { last: string }
    terms: Array<{ type: 'rep' | 'sen'; state: string; party?: string }>
  }>>(
    'https://unitedstates.github.io/congress-legislators/legislators-historical.json',
    { timeout: 60000 },
  )

  const lookup = new Map<string, string>()
  for (const leg of data) {
    const latest = leg.terms[leg.terms.length - 1]
    if (!latest) continue
    const lastName = leg.name.last.toLowerCase()
    const state = latest.state.toLowerCase()
    const p = (latest.party ?? '').toLowerCase()
    const partyAbbr = p === 'democrat' ? 'd' : p === 'republican' ? 'r' : 'i'
    const key = latest.type === 'sen'
      ? `${lastName}:${state}:senate`
      : `${lastName}:${state}:${partyAbbr}`
    lookup.set(key, leg.id.bioguide)
  }
  console.log('[Historical] entries:', lookup.size)

  const reps = await prisma.representative.findMany({
    where: { level: 'federal', photoUrl: null },
    select: { id: true, fullName: true, chamber: true, stateCode: true, party: true },
  })

  let updated = 0
  for (const rep of reps) {
    const parts = rep.fullName.trim().split(' ')
    const lastName = parts[parts.length - 1]?.toLowerCase() ?? ''
    const state = rep.stateCode?.toLowerCase() ?? ''
    const p = (rep.party ?? '').toLowerCase()
    const partyAbbr = p === 'democrat' || p === 'd' ? 'd' : p === 'republican' || p === 'r' ? 'r' : 'i'
    const key = rep.chamber === 'senate'
      ? `${lastName}:${state}:senate`
      : `${lastName}:${state}:${partyAbbr}`
    const bioguideId = lookup.get(key)
    if (bioguideId) {
      await prisma.representative.update({
        where: { id: rep.id },
        data: { photoUrl: `https://unitedstates.github.io/images/congress/225x275/${bioguideId}.jpg` },
      })
      console.log(' ', rep.fullName, '->', bioguideId)
      updated++
    }
  }
  console.log('[Historical] Updated:', updated, '/ remaining:', reps.length - updated)
  await prisma.$disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
