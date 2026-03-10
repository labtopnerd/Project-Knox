import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  // 1. Count state-level reps in DB
  const stateRepCount = await prisma.representative.count({ where: { level: 'state' } })
  console.log(`State-level reps in DB: ${stateRepCount}`)

  // 2. Raw UserRepresentative rows for MN user
  const mnUserId = 'cmm74hx090000g2tj2dd984ug'
  const rawLinks = await prisma.userRepresentative.findMany({
    where: { userId: mnUserId },
    select: { representativeId: true, representative: { select: { fullName: true, chamber: true, level: true, stateCode: true } } },
  })
  console.log(`\nRaw UserRepresentative rows for MN user (${rawLinks.length}):`)
  for (const l of rawLinks) console.log(`  ${l.representativeId} → ${l.representative.fullName} (${l.representative.level}/${l.representative.chamber})`)

  // 3. Pete Stauber in DB?
  const stauber = await prisma.representative.findMany({
    where: { fullName: { contains: 'Stauber', mode: 'insensitive' } },
    select: { id: true, fullName: true, stateCode: true, chamber: true, level: true, source: true },
  })
  console.log(`\nPete Stauber records: ${JSON.stringify(stauber)}`)

  // 4. Any state-level OpenStates reps for MN?
  const mnStateReps = await prisma.representative.findMany({
    where: { source: 'openstates', level: 'state', stateCode: 'MN' },
    select: { id: true, fullName: true, chamber: true },
  })
  console.log(`\nOpenStates state reps for MN: ${mnStateReps.length}`)
  for (const r of mnStateReps) console.log(`  ${r.fullName} (${r.chamber})`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
