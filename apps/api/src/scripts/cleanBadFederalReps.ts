/**
 * One-time cleanup: delete OpenStates representative records that were incorrectly
 * stored as state-level when they are actually federal (US Congress) legislators.
 *
 * These were created by the /representatives/lookup route before the fix that
 * filters OpenStates geo results to state jurisdictions only.
 *
 * Detection: OpenStates jurisdiction IDs for federal reps do NOT contain "/state:"
 *   Federal: "ocd-jurisdiction/country:us/government"
 *   State:   "ocd-jurisdiction/country:us/state:ca/government"
 *
 * Run with: npx tsx src/scripts/cleanBadFederalReps.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. Count what we're about to delete
  const badReps = await prisma.$queryRaw<Array<{ id: string; fullName: string; chamber: string; level: string }>>`
    SELECT id, "fullName", chamber, level
    FROM "Representative"
    WHERE source = 'openstates'
      AND level = 'state'
      AND "rawData"->'jurisdiction'->>'id' NOT LIKE '%/state:%'
    ORDER BY "fullName"
  `

  if (badReps.length === 0) {
    console.log('No bad federal reps found — nothing to clean up.')
    return
  }

  console.log(`Found ${badReps.length} incorrectly-labeled federal rep(s):`)
  for (const r of badReps) {
    console.log(`  ${r.fullName} (chamber=${r.chamber}, level=${r.level})`)
  }

  const badIds = badReps.map((r) => r.id)

  // 2. Count linked UserRepresentative rows
  const linkedCount = await prisma.userRepresentative.count({
    where: { representativeId: { in: badIds } },
  })
  console.log(`\nLinked UserRepresentative rows: ${linkedCount}`)

  // 3. Delete UserRepresentative links first (FK constraint)
  const deletedLinks = await prisma.userRepresentative.deleteMany({
    where: { representativeId: { in: badIds } },
  })
  console.log(`Deleted ${deletedLinks.count} UserRepresentative link(s)`)

  // 4. Delete the bad Representative records
  const deletedReps = await prisma.representative.deleteMany({
    where: { id: { in: badIds } },
  })
  console.log(`Deleted ${deletedReps.count} bad Representative record(s)`)

  console.log('\nDone. Users will get correct federal reps on their next address lookup.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
