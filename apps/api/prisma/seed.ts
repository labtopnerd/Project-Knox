/**
 * Prisma seed script — populate the database with sample data for development.
 * Run with: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('[Seed] Starting database seed...')

  // Create a test user
  const passwordHash = await bcrypt.hash('password123', 12)
  const user = await prisma.user.upsert({
    where: { email: 'demo@projectknox.app' },
    create: {
      email: 'demo@projectknox.app',
      name: 'Demo User',
      passwordHash,
      profile: {
        create: {
          zipCode: '94102',
          city: 'San Francisco',
          stateCode: 'CA',
          fedDistrict: 'CA-11',
        },
      },
    },
    update: {},
  })
  console.log('[Seed] Created demo user:', user.email)

  // Create sample representatives
  const sampleReps = [
    {
      externalId: 'congress:S000033',
      source: 'congress',
      fullName: 'Bernie Sanders',
      party: 'Independent',
      chamber: 'senate',
      level: 'federal',
      stateCode: 'VT',
      title: 'Senator',
      phone: '202-224-5141',
      websiteUrl: 'https://www.sanders.senate.gov',
      contactFormUrl: 'https://www.sanders.senate.gov/contact/',
    },
    {
      externalId: 'congress:P000197',
      source: 'congress',
      fullName: 'Nancy Pelosi',
      party: 'Democrat',
      chamber: 'house',
      level: 'federal',
      stateCode: 'CA',
      district: '11',
      title: 'Representative',
      phone: '202-225-4965',
      websiteUrl: 'https://pelosi.house.gov',
      contactFormUrl: 'https://pelosi.house.gov/contact-me',
    },
  ]

  for (const repData of sampleReps) {
    await prisma.representative.upsert({
      where: { externalId: repData.externalId },
      create: repData,
      update: {},
    })
  }
  console.log('[Seed] Created sample representatives')

  // Create sample bills
  const sampleBills = [
    {
      externalId: 'congress:119:hr:1',
      source: 'congress',
      congressNumber: 119,
      billType: 'hr',
      billNumber: 'H.R. 1',
      title: 'Lower Energy Costs Act',
      summary:
        'A bill to lower energy costs for American families by increasing domestic energy production and reducing regulatory barriers.',
      status: 'introduced',
      chamber: 'house',
      level: 'federal',
      issueTags: ['energy', 'economy', 'regulation'],
    },
    {
      externalId: 'congress:119:s:100',
      source: 'congress',
      congressNumber: 119,
      billType: 's',
      billNumber: 'S. 100',
      title: 'American Healthcare Act',
      summary:
        'Legislation to expand access to affordable healthcare coverage for all Americans.',
      status: 'committee',
      chamber: 'senate',
      level: 'federal',
      issueTags: ['healthcare', 'insurance'],
    },
  ]

  for (const billData of sampleBills) {
    await prisma.bill.upsert({
      where: { externalId: billData.externalId },
      create: billData,
      update: {},
    })
  }
  console.log('[Seed] Created sample bills')

  console.log('[Seed] Database seed complete!')
}

main()
  .catch((err) => {
    console.error('[Seed] Error:', err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
