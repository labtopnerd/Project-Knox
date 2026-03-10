import 'dotenv/config'
import axios from 'axios'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function run() {
  const log = await prisma.syncLog.create({ data: { job: 'backfill:textFormats', status: 'running' } })
  const start = Date.now()

  try {
    const KEY = process.env.CONGRESS_API_KEY!
    const bills = await prisma.bill.findMany({
      where: { textFormats: { equals: Prisma.DbNull }, congressNumber: { not: null }, billType: { not: null } },
      select: { id: true, congressNumber: true, billType: true, billNumber: true }
    })
    console.log('Backfilling text formats for', bills.length, 'bills')
    let done = 0
    for (const b of bills) {
      const num = b.billNumber!.split(' ').pop()
      try {
        const r = await axios.get(
          `https://api.congress.gov/v3/bill/${b.congressNumber}/${b.billType}/${num}/text`,
          { params: { api_key: KEY, format: 'json' }, timeout: 10000 }
        )
        const formats = r.data?.textVersions?.[0]?.formats ?? []
        if (formats.length) {
          await prisma.bill.update({ where: { id: b.id }, data: { textFormats: formats } })
          done++
        }
      } catch {}
      await sleep(300)
    }
    console.log('Done:', done, '/', bills.length, 'bills with text formats')

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        durationMs: Date.now() - start,
        result: { synced: done, total: bills.length },
      },
    })
  } catch (err) {
    console.error('[backfillTextFormats] Fatal error:', err)
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'failed', completedAt: new Date(), error: String(err) },
    }).catch(() => {})
    throw err
  }

  await prisma.$disconnect()
}

run().catch(() => process.exit(1))
