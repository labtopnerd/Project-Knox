import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { VoteResultsBar } from '@/components/bills/VoteResultsBar'
import { BillStatusBadge } from '@/components/bills/BillStatusBadge'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Community Polling' }
export const dynamic = 'force-dynamic'

async function getTrendingBills() {
  const since = new Date()
  since.setDate(since.getDate() - 7)

  // Get top 15 most-voted bills in the last 7 days
  const trending = await prisma.userVote.groupBy({
    by: ['billId'],
    where: { createdAt: { gte: since } },
    _count: { billId: true },
    orderBy: { _count: { billId: 'desc' } },
    take: 15,
  })

  if (trending.length === 0) {
    // Fallback: bills with most aggregate votes overall
    return prisma.billVoteAggregate.findMany({
      where: { totalCount: { gt: 0 } },
      orderBy: { totalCount: 'desc' },
      take: 15,
      include: {
        bill: {
          select: {
            id: true,
            billNumber: true,
            title: true,
            status: true,
            chamber: true,
            level: true,
            stateCode: true,
            issueTags: true,
          },
        },
      },
    })
  }

  const billIds = trending.map((t) => t.billId)
  const aggregates = await prisma.billVoteAggregate.findMany({
    where: { billId: { in: billIds } },
    include: {
      bill: {
        select: {
          id: true,
          billNumber: true,
          title: true,
          status: true,
          chamber: true,
          level: true,
          stateCode: true,
          issueTags: true,
        },
      },
    },
  })

  // Preserve trending order
  return billIds
    .map((id) => aggregates.find((a) => a.billId === id))
    .filter(Boolean) as typeof aggregates
}

async function getTopContested() {
  // Bills closest to 50/50 split with at least 10 votes
  const aggregates = await prisma.billVoteAggregate.findMany({
    where: { totalCount: { gte: 10 } },
    include: {
      bill: {
        select: {
          id: true,
          billNumber: true,
          title: true,
          status: true,
          chamber: true,
          level: true,
          stateCode: true,
        },
      },
    },
  })

  return aggregates
    .map((a) => {
      const supportPct = a.totalCount ? a.supportCount / a.totalCount : 0
      const opposePct = a.totalCount ? a.opposeCount / a.totalCount : 0
      const contestedness = 1 - Math.abs(supportPct - opposePct)
      return { ...a, contestedness }
    })
    .sort((a, b) => b.contestedness - a.contestedness)
    .slice(0, 5)
}

export default async function CommunityPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [trending, contested] = await Promise.all([getTrendingBills(), getTopContested()])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Community Polling</h1>
        <p className="mt-1 text-gray-500">
          See where the Project Knox community stands on bills currently in Congress and state legislatures
        </p>
      </div>

      {/* Trending this week */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <span>🔥</span> Trending this week
        </h2>
        {trending.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-8 text-center text-gray-400">
            No votes cast yet. Be the first to weigh in on a bill!
          </div>
        ) : (
          <div className="space-y-4">
            {trending.map((agg) => {
              if (!agg?.bill) return null
              const supportPct = agg.totalCount ? Math.round((agg.supportCount / agg.totalCount) * 100) : 0
              const opposePct = agg.totalCount ? Math.round((agg.opposeCount / agg.totalCount) * 100) : 0
              const neutralPct = 100 - supportPct - opposePct
              return (
                <article
                  key={agg.billId}
                  className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      {agg.bill.billNumber && (
                        <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {agg.bill.billNumber}
                        </span>
                      )}
                      <Link
                        href={`/bills/${agg.bill.id}`}
                        className="text-sm font-semibold text-gray-900 hover:text-primary-600 line-clamp-2"
                      >
                        {agg.bill.title}
                      </Link>
                    </div>
                    <BillStatusBadge status={agg.bill.status} />
                  </div>
                  <VoteResultsBar
                    supportCount={agg.supportCount}
                    opposeCount={agg.opposeCount}
                    neutralCount={agg.neutralCount}
                    totalCount={agg.totalCount}
                    showCounts
                  />
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                    <span>
                      {agg.bill.level === 'state' && agg.bill.stateCode
                        ? `${agg.bill.stateCode} Legislature`
                        : agg.bill.chamber === 'senate'
                        ? 'U.S. Senate'
                        : agg.bill.chamber === 'house'
                        ? 'U.S. House'
                        : 'Congress'}
                    </span>
                    <Link
                      href={`/bills/${agg.bill.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      Vote or view →
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* Most contested */}
      {contested.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
            <span>⚖️</span> Most contested
          </h2>
          <div className="space-y-4">
            {contested.map((agg) => {
              if (!agg?.bill) return null
              return (
                <article
                  key={agg.billId}
                  className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3">
                    {agg.bill.billNumber && (
                      <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {agg.bill.billNumber}
                      </span>
                    )}
                    <Link
                      href={`/bills/${agg.bill.id}`}
                      className="text-sm font-semibold text-gray-900 hover:text-primary-600 line-clamp-2"
                    >
                      {agg.bill.title}
                    </Link>
                  </div>
                  <VoteResultsBar
                    supportCount={agg.supportCount}
                    opposeCount={agg.opposeCount}
                    neutralCount={agg.neutralCount}
                    totalCount={agg.totalCount}
                    showCounts
                  />
                  <div className="mt-2 text-right">
                    <Link
                      href={`/bills/${agg.bill.id}`}
                      className="text-xs font-medium text-primary-600 hover:underline"
                    >
                      View & vote →
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {/* CTA if no data */}
      {trending.length === 0 && contested.length === 0 && (
        <div className="rounded-xl border border-primary-100 bg-primary-50 p-6 text-center">
          <p className="text-base font-semibold text-primary-800">The community is just getting started</p>
          <p className="mt-1 text-sm text-primary-600">
            Head to your feed and cast your first votes to see results here.
          </p>
          <Link
            href="/feed"
            className="mt-4 inline-block rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Go to my feed
          </Link>
        </div>
      )}
    </div>
  )
}
