/**
 * Repair: re-link federal (LegiScan) representatives for users who have none.
 *
 * Run after cleanBadFederalReps.ts if users lost their federal rep links.
 * For each user whose profile has a stateCode but no federal reps linked,
 * finds the matching LegiScan senators + house rep and creates the links.
 *
 * Usage: npx tsx src/scripts/repairFederalRepLinks.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find users with a stateCode in their profile but no federal reps linked
  const profiles = await prisma.userProfile.findMany({
    where: { stateCode: { not: null } },
    select: {
      id: true,        // same as userId
      stateCode: true,
      fedDistrict: true,
    },
  })

  let repaired = 0

  for (const profile of profiles) {
    if (!profile.stateCode) continue

    const existingFederal = await prisma.userRepresentative.findFirst({
      where: {
        userId: profile.id,
        representative: { level: 'federal' },
      },
    })

    if (existingFederal) continue  // already has federal reps linked

    console.log(`User ${profile.id} (${profile.stateCode}) has no federal reps — searching LegiScan records...`)

    // Find LegiScan senators for this state
    const senators = await prisma.representative.findMany({
      where: {
        source: 'congress',
        level: 'federal',
        chamber: 'senate',
        stateCode: profile.stateCode,
        isActive: true,
      },
      select: { id: true, fullName: true },
    })

    // Find LegiScan house rep for this state + district
    const districtNum = profile.fedDistrict
      ? profile.fedDistrict.replace(`${profile.stateCode}-`, '')
      : null

    const houseReps = districtNum
      ? await prisma.representative.findMany({
          where: {
            source: 'congress',
            level: 'federal',
            chamber: 'house',
            stateCode: profile.stateCode,
            district: districtNum,
            isActive: true,
          },
          select: { id: true, fullName: true },
        })
      : []

    const toLink = [...senators, ...houseReps]

    if (toLink.length === 0) {
      console.log(`  No LegiScan reps found for ${profile.stateCode} — user will need to redo address lookup`)
      continue
    }

    console.log(`  Linking: ${toLink.map((r) => r.fullName).join(', ')}`)

    await prisma.userRepresentative.createMany({
      data: toLink.map((r) => ({ userId: profile.id, representativeId: r.id })),
      skipDuplicates: true,
    })

    repaired++
  }

  console.log(`\nDone. Repaired ${repaired} user(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
