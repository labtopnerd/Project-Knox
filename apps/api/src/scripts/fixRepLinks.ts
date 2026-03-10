import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function link(userId: string, repId: string, name: string) {
  await prisma.userRepresentative.upsert({
    where: { userId_representativeId: { userId, representativeId: repId } },
    create: { userId, representativeId: repId },
    update: {},
  })
  console.log(`  ✓ ${name}`)
}

async function main() {
  const mnUserId = 'cmm74hx090000g2tj2dd984ug'

  console.log('Linking reps for MN user:')

  // Pete Stauber (federal house, already in DB)
  const stauber = await prisma.representative.findFirst({
    where: { fullName: { contains: 'Stauber', mode: 'insensitive' }, source: 'congress' },
    select: { id: true, fullName: true },
  })
  if (stauber) await link(mnUserId, stauber.id, stauber.fullName)

  // MN state reps (Grant Hauschild, Roger Skraba)
  const mnStateReps = await prisma.representative.findMany({
    where: { source: 'openstates', level: 'state', stateCode: 'MN' },
    select: { id: true, fullName: true },
  })
  for (const r of mnStateReps) await link(mnUserId, r.id, r.fullName)

  // Verify
  const final = await prisma.userRepresentative.findMany({
    where: { userId: mnUserId },
    include: { representative: { select: { fullName: true, chamber: true, level: true } } },
  })
  console.log(`\nMN user now has ${final.length} reps:`)
  for (const l of final) {
    console.log(`  ${l.representative.fullName} (${l.representative.level}/${l.representative.chamber})`)
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
