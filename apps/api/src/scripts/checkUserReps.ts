import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const profiles = await prisma.userProfile.findMany({
    where: { stateCode: { not: null } },
    select: { id: true, stateCode: true, fedDistrict: true },
  })
  for (const profile of profiles) {
    const links = await prisma.userRepresentative.findMany({
      where: { userId: profile.id },
      include: { representative: { select: { fullName: true, chamber: true, level: true, stateCode: true, source: true } } },
    })
    console.log(`\nUser ${profile.id} (${profile.stateCode}, district ${profile.fedDistrict}):`)
    if (links.length === 0) console.log('  (no reps linked)')
    for (const l of links) {
      const r = l.representative
      console.log(`  ${r.fullName} | ${r.level} | ${r.chamber} | ${r.stateCode} | src=${r.source}`)
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
