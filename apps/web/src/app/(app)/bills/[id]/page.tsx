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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ExternalLink, Calendar, ChevronLeft, FileText, ThumbsUp } from 'lucide-react'
import type { Representative } from '@project-knox/types'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params
  const bill = await prisma.bill.findUnique({ where: { id }, select: { title: true } })
  return { title: bill?.title ?? 'Bill Detail' }
}

export default async function BillDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await auth()

  const [bill, userVoteRow, bookmarkRow] = await Promise.all([
    prisma.bill.findUnique({
      where: { id },
      include: {
        aggregates: true,
        sponsor: true,
        cosponsors: { include: { representative: true }, take: 12 },
      },
    }),
    session?.user?.id
      ? prisma.userVote.findUnique({
          where: { userId_billId: { userId: session.user.id, billId: id } },
          select: { vote: true },
        })
      : null,
    session?.user?.id
      ? prisma.billBookmark.findUnique({
          where: { userId_billId: { userId: session.user.id, billId: id } },
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
    house:        'U.S. House of Representatives',
    senate:       'U.S. Senate',
    state_house:  `${bill.stateCode ?? ''} State House`,
    state_senate: `${bill.stateCode ?? ''} State Senate`,
  }

  const sponsor = bill.sponsor as Representative | null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const billShareUrl = `${appUrl}/bills/${bill.id}`

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back */}
      <Link
        href="/feed"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to feed
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              {bill.billNumber && (
                <span className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-navy-900 dark:text-blue-400">
                  {bill.billNumber}
                </span>
              )}
              {bill.level === 'federal' && bill.chamber && (
                <span className="mb-2 block text-sm text-muted-foreground">
                  {chamberLabel[bill.chamber] ?? bill.chamber}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {session && <BookmarkButton billId={bill.id} initialBookmarked={isBookmarked} />}
              <BillStatusBadge status={bill.status as string} />
            </div>
          </div>

          <h1 className="mb-4 text-xl font-bold leading-snug text-foreground">{bill.title}</h1>

          {/* Meta */}
          <div className="mb-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
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
                className="flex items-center gap-1.5 text-navy-900 hover:underline dark:text-blue-400"
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
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}

          {/* Last action text */}
          {bill.lastActionText && (
            <p className="text-sm italic text-muted-foreground">Latest: {bill.lastActionText}</p>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {bill.summary && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">{bill.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Full text link */}
      {bill.fullTextUrl && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Full bill text
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Read the complete legislative text of this bill on the official government source.
            </p>
            <a
              href={bill.fullTextUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Read full text
            </a>
          </CardContent>
        </Card>
      )}

      {/* Community opinion */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Community opinion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {aggregates ? (
            <VoteResultsBar
              supportCount={aggregates.supportCount}
              opposeCount={aggregates.opposeCount}
              neutralCount={aggregates.neutralCount}
              totalCount={aggregates.totalCount}
              showCounts
            />
          ) : (
            <p className="text-sm italic text-muted-foreground">No votes yet — be the first to weigh in</p>
          )}

          <Separator />

          {session ? (
            <VoteButtons billId={bill.id} currentVote={userVote} aggregates={aggregates} />
          ) : (
            <p className="text-sm text-muted-foreground">
              <Link href="/login" className="font-medium text-navy-900 hover:underline dark:text-blue-400">
                Sign in
              </Link>{' '}
              to cast your vote on this bill.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Sponsor */}
      {sponsor && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Sponsor</CardTitle>
              <span className="flex items-center gap-1.5 rounded-full border border-support/40 bg-support/10 px-3 py-1 text-xs font-semibold text-support dark:text-green-400">
                <ThumbsUp className="h-3.5 w-3.5" />
                Supports this bill
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <RepCard rep={sponsor} compact />
          </CardContent>
        </Card>
      )}

      {/* Cosponsors */}
      {bill.cosponsors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Cosponsors ({bill.cosponsors.length})</CardTitle>
              <span className="flex items-center gap-1.5 rounded-full border border-support/40 bg-support/10 px-3 py-1 text-xs font-semibold text-support dark:text-green-400">
                <ThumbsUp className="h-3.5 w-3.5" />
                All support this bill
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {bill.cosponsors.map((cs) => (
                <RepCard key={cs.representativeId} rep={cs.representative as Representative} compact />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contact sponsor */}
      {sponsor && session && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Contact {sponsor.fullName}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Let the bill&apos;s sponsor know your position.
            </p>
          </CardHeader>
          <CardContent>
            <ContactForm rep={sponsor} billId={bill.id} billTitle={bill.title} />
          </CardContent>
        </Card>
      )}

      {/* Share */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Spread the word</CardTitle>
          <p className="text-sm text-muted-foreground">
            Help others stay informed — share this bill with friends, family, or on social media.
          </p>
        </CardHeader>
        <CardContent>
          <ShareButtons billTitle={bill.title} billUrl={billShareUrl} />
        </CardContent>
      </Card>
    </div>
  )
}
