import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VoteButtons } from '@/components/bills/VoteButtons'
import { VoteResultsBar } from '@/components/bills/VoteResultsBar'
import { BillStatusBadge } from '@/components/bills/BillStatusBadge'
import { BookmarkButton } from '@/components/bills/BookmarkButton'
import { ShareButtons } from '@/components/bills/ShareButtons'
import { RepCard } from '@/components/representatives/RepCard'
import { ContactForm } from '@/components/contact/ContactForm'
import { ExternalLink, Calendar, ChevronLeft, FileText, ThumbsUp } from 'lucide-react'
import type { Representative } from '@project-knox/types'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export async function generateMetadata({ params }: { params: Params }) {
  const bill = await prisma.bill.findUnique({ where: { id: params.id }, select: { title: true } })
  return { title: bill?.title ?? 'Bill Detail' }
}

export default async function BillDetailPage({ params }: { params: Params }) {
  const session = await auth()

  const [bill, userVoteRow, bookmarkRow] = await Promise.all([
    prisma.bill.findUnique({
      where: { id: params.id },
      include: {
        aggregates: true,
        sponsor: true,
        cosponsors: {
          include: {
            representative: true,
          },
          take: 12,
        },
      },
    }),
    session?.user?.id
      ? prisma.userVote.findUnique({
          where: { userId_billId: { userId: session.user.id, billId: params.id } },
          select: { vote: true },
        })
      : null,
    session?.user?.id
      ? prisma.billBookmark.findUnique({
          where: { userId_billId: { userId: session.user.id, billId: params.id } },
          select: { userId: true },
        })
      : null,
  ])

  if (!bill) notFound()

  const userVote = (userVoteRow?.vote ?? null) as 'support' | 'oppose' | 'neutral' | null
  const isBookmarked = !!bookmarkRow

  const aggregates = bill.aggregates
    ? {
        ...bill.aggregates,
        supportPercent: bill.aggregates.totalCount
          ? Math.round((bill.aggregates.supportCount / bill.aggregates.totalCount) * 100)
          : 0,
        opposePercent: bill.aggregates.totalCount
          ? Math.round((bill.aggregates.opposeCount / bill.aggregates.totalCount) * 100)
          : 0,
        neutralPercent: bill.aggregates.totalCount
          ? Math.round((bill.aggregates.neutralCount / bill.aggregates.totalCount) * 100)
          : 0,
      }
    : null

  const chamberLabel: Record<string, string> = {
    house: 'U.S. House of Representatives',
    senate: 'U.S. Senate',
    state_house: `${bill.stateCode ?? ''} State House`,
    state_senate: `${bill.stateCode ?? ''} State Senate`,
  }

  // We need the sponsor as a Representative type for RepCard/ContactForm
  const sponsor = bill.sponsor as Representative | null

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const billShareUrl = `${appUrl}/bills/${bill.id}`

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back */}
      <Link
        href="/feed"
        className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to feed
      </Link>

      {/* Header */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            {bill.billNumber && (
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                {bill.billNumber}
              </span>
            )}
            {bill.level === 'federal' && bill.chamber && (
              <span className="mb-2 block text-sm text-gray-500">
                {chamberLabel[bill.chamber] ?? bill.chamber}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {session && (
              <BookmarkButton billId={bill.id} initialBookmarked={isBookmarked} />
            )}
            <BillStatusBadge status={bill.status as string} />
          </div>
        </div>

        <h1 className="mb-4 text-xl font-bold text-gray-900 leading-snug">{bill.title}</h1>

        {/* Meta */}
        <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-500">
          {bill.introducedDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Introduced {new Date(bill.introducedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          {bill.lastActionDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Last action {new Date(bill.lastActionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          {bill.url && (
            <a
              href={bill.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Official bill page
            </a>
          )}
        </div>

        {/* Tags */}
        {bill.issueTags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {bill.issueTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Last action text */}
        {bill.lastActionText && (
          <p className="text-sm text-gray-500 italic">Latest: {bill.lastActionText}</p>
        )}
      </div>

      {/* Summary */}
      {bill.summary && (
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Summary</h2>
          <div className="prose prose-sm max-w-none text-gray-700">
            <p>{bill.summary}</p>
          </div>
        </section>
      )}

      {/* Full text link */}
      {bill.fullTextUrl && (
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900">
            <FileText className="h-4 w-4 text-gray-500" />
            Full bill text
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Read the complete legislative text of this bill on the official government source.
          </p>
          <a
            href={bill.fullTextUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-700"
          >
            <ExternalLink className="h-4 w-4" />
            Read full text
          </a>
        </section>
      )}

      {/* Community poll */}
      <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Community opinion</h2>
        {aggregates ? (
          <VoteResultsBar
            supportCount={aggregates.supportCount}
            opposeCount={aggregates.opposeCount}
            neutralCount={aggregates.neutralCount}
            totalCount={aggregates.totalCount}
            showCounts
          />
        ) : (
          <p className="text-sm text-gray-400 italic">No votes yet — be the first to weigh in</p>
        )}

        <div className="mt-5 border-t border-gray-50 pt-5">
          {session ? (
            <VoteButtons
              billId={bill.id}
              currentVote={userVote}
              aggregates={aggregates}
            />
          ) : (
            <p className="text-sm text-gray-500">
              <Link href="/login" className="font-medium text-primary-600 hover:underline">
                Sign in
              </Link>{' '}
              to cast your vote on this bill.
            </p>
          )}
        </div>
      </section>

      {/* Sponsor */}
      {sponsor && (
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900">Sponsor</h2>
            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              <ThumbsUp className="h-3.5 w-3.5" />
              Supports this bill
            </span>
          </div>
          <RepCard rep={sponsor} compact />
        </section>
      )}

      {/* Cosponsors */}
      {bill.cosponsors.length > 0 && (
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              Cosponsors ({bill.cosponsors.length})
            </h2>
            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              <ThumbsUp className="h-3.5 w-3.5" />
              All support this bill
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {bill.cosponsors.map((cs) => (
              <RepCard key={cs.representativeId} rep={cs.representative as Representative} compact />
            ))}
          </div>
        </section>
      )}

      {/* Contact sponsor */}
      {sponsor && session && (
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            Contact {sponsor.fullName}
          </h2>
          <p className="mb-5 text-sm text-gray-500">
            Let the bill&apos;s sponsor know your position.
          </p>
          <ContactForm rep={sponsor} billId={bill.id} billTitle={bill.title} />
        </section>
      )}

      {/* Share */}
      <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Spread the word</h2>
        <p className="mb-4 text-sm text-gray-500">
          Help others stay informed — share this bill with friends, family, or on social media.
        </p>
        <ShareButtons billTitle={bill.title} billUrl={billShareUrl} />
      </section>
    </div>
  )
}
