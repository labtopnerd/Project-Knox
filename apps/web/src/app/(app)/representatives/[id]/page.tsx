import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillCard } from '@/components/bills/BillCard'
import { ContactForm } from '@/components/contact/ContactForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, Phone, Mail, Globe, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Representative, BillWithUserVote } from '@project-knox/types'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const PARTY_COLORS: Record<string, string> = {
  Democrat:    'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',
  Republican:  'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
  Independent: 'border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300',
}

const CHAMBER_LABELS: Record<string, string> = {
  senate:       'U.S. Senate',
  house:        'U.S. House of Representatives',
  state_senate: 'State Senate',
  state_house:  'State House',
  local:        'Local Government',
}

export async function generateMetadata({ params }: { params: Params }) {
  const { id } = await params
  const rep = await prisma.representative.findUnique({
    where: { id },
    select: { fullName: true },
  })
  return { title: rep ? `${rep.fullName} — Representative` : 'Representative' }
}

export default async function RepDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await auth()

  const rep = await prisma.representative.findUnique({
    where: { id },
    include: {
      sponsoredBills: {
        orderBy: { lastActionDate: 'desc' },
        take: 8,
        include: { aggregates: true },
      },
    },
  })

  if (!rep) notFound()

  let userVotes: Record<string, string> = {}
  if (session?.user?.id && rep.sponsoredBills.length > 0) {
    const votes = await prisma.userVote.findMany({
      where: { userId: session.user.id, billId: { in: rep.sponsoredBills.map((b) => b.id) } },
      select: { billId: true, vote: true },
    })
    userVotes = Object.fromEntries(votes.map((v) => [v.billId, v.vote]))
  }

  const partyClass = PARTY_COLORS[rep.party ?? ''] ?? 'border-border text-muted-foreground'
  const chamberLabel = CHAMBER_LABELS[rep.chamber] ?? rep.chamber

  const billsWithVotes: BillWithUserVote[] = rep.sponsoredBills.map((bill) => {
    const agg = bill.aggregates
    return {
      id: bill.id,
      externalId: bill.externalId,
      source: bill.source as BillWithUserVote['source'],
      billNumber: bill.billNumber,
      title: bill.title,
      shortTitle: bill.shortTitle,
      summary: bill.summary,
      status: bill.status as BillWithUserVote['status'],
      chamber: bill.chamber as BillWithUserVote['chamber'],
      level: bill.level as BillWithUserVote['level'],
      stateCode: bill.stateCode,
      introducedDate: bill.introducedDate?.toISOString() ?? null,
      lastActionDate: bill.lastActionDate?.toISOString() ?? null,
      lastActionText: bill.lastActionText,
      sponsorId: bill.sponsorId,
      sponsorName: rep.fullName,
      issueTags: bill.issueTags,
      url: bill.url,
      syncedAt: bill.lastSyncedAt?.toISOString() ?? bill.createdAt.toISOString(),
      createdAt: bill.createdAt.toISOString(),
      userVote: (userVotes[bill.id] ?? null) as BillWithUserVote['userVote'],
      aggregates: agg
        ? {
            billId: agg.billId,
            supportCount: agg.supportCount,
            opposeCount: agg.opposeCount,
            neutralCount: agg.neutralCount,
            totalCount: agg.totalCount,
            supportPercent: agg.totalCount ? Math.round((agg.supportCount / agg.totalCount) * 100) : 0,
            opposePercent: agg.totalCount ? Math.round((agg.opposeCount / agg.totalCount) * 100) : 0,
            neutralPercent: agg.totalCount ? Math.round((agg.neutralCount / agg.totalCount) * 100) : 0,
          }
        : null,
    }
  })

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/representatives"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to my representatives
      </Link>

      {/* Profile card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-5">
            {/* Photo / initials */}
            <div className="shrink-0">
              {rep.photoUrl ? (
                <Image
                  src={rep.photoUrl}
                  alt={rep.fullName}
                  width={80}
                  height={80}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-navy-900 text-3xl font-bold text-white">
                  {rep.fullName.charAt(0)}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground">
                {rep.title ? `${rep.title} ` : ''}{rep.fullName}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {chamberLabel}
                {rep.stateCode && ` — ${rep.stateCode}`}
                {rep.district && `, District ${rep.district}`}
              </p>
              {rep.party && (
                <Badge variant="outline" className={cn('mt-2', partyClass)}>
                  {rep.party}
                </Badge>
              )}
            </div>
          </div>

          {/* Contact links */}
          {(rep.phone ?? rep.email ?? rep.contactFormUrl ?? rep.websiteUrl) && (
            <>
              <Separator className="my-5" />
              <div className="flex flex-wrap gap-2">
                {rep.phone && (
                  <a
                    href={`tel:${rep.phone}`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    {rep.phone}
                  </a>
                )}
                {rep.email && (
                  <a
                    href={`mailto:${rep.email}`}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </a>
                )}
                {rep.contactFormUrl && (
                  <a
                    href={rep.contactFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Contact form
                  </a>
                )}
                {rep.websiteUrl && (
                  <a
                    href={rep.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Globe className="h-4 w-4" />
                    Website
                  </a>
                )}
              </div>
            </>
          )}

          {rep.officeAddress && (
            <p className="mt-3 text-xs text-muted-foreground">{rep.officeAddress}</p>
          )}
        </CardContent>
      </Card>

      {/* Contact form */}
      {session && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Send a message</CardTitle>
            <p className="text-sm text-muted-foreground">
              Contact {rep.title ?? rep.fullName} about any issue or upcoming bill.
            </p>
          </CardHeader>
          <CardContent>
            <ContactForm rep={rep as unknown as Representative} />
          </CardContent>
        </Card>
      )}

      {/* Sponsored bills */}
      {billsWithVotes.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Recent sponsored legislation
          </h2>
          <div className="space-y-4">
            {billsWithVotes.map((bill) => (
              <BillCard key={bill.id} bill={bill} showVoting={!!session} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
