/**
 * Targeted repair: link Pete Stauber (and any other federal reps with correct
 * stateCode but null district) to users missing them.
 *
 * Usage: npx tsx src/scripts/linkMissingReps.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find all users with a stateCode profile
  const profiles = await prisma.userProfile.findMany({
    where: { stateCode: { not: null } },
    select: { id: true, stateCode: true },
  })

  let linked = 0

  for (const profile of profiles) {
    if (!profile.stateCode) continue

    // Find all federal reps for this state (including those with null district)
    const federalReps = await prisma.representative.findMany({
      where: {
        source: 'congress',
        level: 'federal',
        stateCode: profile.stateCode,
        isActive: true,
      },
      select: { id: true, fullName: true, chamber: true },
    })

    if (federalReps.length === 0) continue

    for (const rep of federalReps) {
      const exists = await prisma.userRepresentative.findUnique({
        where: { userId_representativeId: { userId: profile.id, representativeId: rep.id } },
      })
      if (exists) continue

      await prisma.userRepresentative.create({
        data: { userId: profile.id, representativeId: rep.id },
      })
      console.log(`Linked ${rep.fullName} (${rep.chamber}) → user ${profile.id} (${profile.stateCode})`)
      linked++
    }
  }

  console.log(`\nDone. ${linked} new link(s) created.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1) })
