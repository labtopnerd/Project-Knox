import { notFound } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ContactForm } from '@/components/contact/ContactForm'
import { RepAlignmentCard } from '@/components/representatives/RepAlignmentCard'
import { RepVotingHistory } from '@/components/representatives/RepVotingHistory'
import { RepSponsoredBills } from '@/components/representatives/RepSponsoredBills'
import { RepCosponsoredBills } from '@/components/representatives/RepCosponsoredBills'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, Phone, Mail, Globe, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ShareButtons } from '@/components/bills/ShareButtons'
import type { Representative } from '@project-knox/types'

export const dynamic = 'force-dynamic'

type Params = Promise<{ id: string }>

const PARTY_COLORS: Record<string, string> = {
  Democrat:    'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',
  Republican:  'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
  Independent: 'border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300',
}

function formatTimeInOffice(start: Date, end?: Date | null): string {
  const from = start
  const to = end && end < new Date() ? end : new Date()
  const totalMonths =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  if (years === 0) return months === 1 ? '1 month' : `${months} months`
  if (months === 0) return years === 1 ? '1 year' : `${years} years`
  return `${years} year${years !== 1 ? 's' : ''}, ${months} month${months !== 1 ? 's' : ''}`
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
    select: { fullName: true, title: true, party: true, chamber: true, stateCode: true },
  })
  if (!rep) return { title: 'Representative' }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const chamberLabel = CHAMBER_LABELS[rep.chamber] ?? rep.chamber
  const description = `${rep.title ? rep.title + ' ' : ''}${rep.fullName} — ${chamberLabel}${rep.stateCode ? ', ' + rep.stateCode : ''}${rep.party ? ' (' + rep.party + ')' : ''}. Track their votes and sponsored bills on Project Knox.`
  return {
    title: `${rep.fullName} — Representative`,
    description,
    openGraph: {
      title: rep.fullName,
      description,
      url: `${appUrl}/representatives/${id}`,
      type: 'profile' as const,
    },
    twitter: { card: 'summary_large_image' as const, title: rep.fullName, description },
  }
}

export default async function RepDetailPage({ params }: { params: Params }) {
  const { id } = await params
  const session = await auth()

  const [rep, earliestSession] = await Promise.all([
    prisma.representative.findUnique({
      where: { id },
      select: {
        id: true, externalId: true, source: true, fullName: true, title: true,
        party: true, chamber: true, level: true, stateCode: true, district: true,
        photoUrl: true, websiteUrl: true, email: true, phone: true,
        officeAddress: true, contactFormUrl: true, twitterHandle: true,
        termStart: true, termEnd: true,
      },
    }),
    prisma.repSession.findFirst({
      where: { representativeId: id },
      orderBy: { yearStart: 'asc' },
      select: { yearStart: true },
    }),
  ])

  if (!rep) notFound()

  // If this is an OpenStates rep with no bills, find the matching Congress.gov entry by last name.
  // OpenStates geolocation sometimes returns federal reps under their own person records.
  let billsRepId = rep.id
  if (rep.source === 'openstates') {
    const sponsoredCount = await prisma.bill.count({ where: { sponsorId: rep.id } })
    if (sponsoredCount === 0) {
      const nameParts = rep.fullName.includes(',')
        ? rep.fullName.split(',')[0]?.trim()
        : rep.fullName.split(' ').pop()
      if (nameParts) {
        const congressMatch = await prisma.representative.findFirst({
          where: {
            source: 'congress',
            fullName: { contains: nameParts, mode: 'insensitive' },
            ...(rep.stateCode ? { stateCode: rep.stateCode } : {}),
          },
          select: { id: true },
        })
        if (congressMatch) billsRepId = congressMatch.id
      }
    }
  }

  // Lightweight queries for alignment calculation only (just IDs)
  const [sponsoredBillIds, cosponsoredBillIds] = await Promise.all([
    prisma.bill.findMany({ where: { sponsorId: billsRepId }, select: { id: true } }),
    prisma.billCosponsor.findMany({ where: { representativeId: billsRepId }, select: { billId: true } }),
  ])

  const sponsorBillIds = new Set([
    ...sponsoredBillIds.map((b) => b.id),
    ...cosponsoredBillIds.map((c) => c.billId),
  ])

  // Fetch roll call votes for alignment (Yea/Nay only, not already in sponsorBillIds)
  const repVotes = session?.user?.id
    ? await prisma.repVote.findMany({
        where: { representativeId: billsRepId, voteText: { in: ['Yea', 'Nay'] } },
        select: { voteText: true, rollCall: { select: { billId: true } } },
      })
    : []

  const rollCallVoteMap = new Map<string, 'Yea' | 'Nay'>()
  for (const rv of repVotes) {
    const billId = rv.rollCall.billId
    if (!sponsorBillIds.has(billId)) {
      rollCallVoteMap.set(billId, rv.voteText as 'Yea' | 'Nay')
    }
  }

  const allBillIds = [...sponsorBillIds, ...rollCallVoteMap.keys()]

  // Fetch user votes on all relevant bills
  let userVoteMap: Record<string, string> = {}
  if (session?.user?.id && allBillIds.length > 0) {
    const votes = await prisma.userVote.findMany({
      where: { userId: session.user.id, billId: { in: allBillIds } },
      select: { billId: true, vote: true },
    })
    userVoteMap = Object.fromEntries(votes.map((v) => [v.billId, v.vote]))
  }

  // Compute alignment stats
  let agreed = 0, disagreed = 0, neutral = 0
  for (const billId of sponsorBillIds) {
    const vote = userVoteMap[billId]
    if (vote === 'support') agreed++
    else if (vote === 'oppose') disagreed++
    else if (vote === 'neutral') neutral++
  }
  for (const [billId, repVote] of rollCallVoteMap) {
    const userVote = userVoteMap[billId]
    if (!userVote || userVote === 'neutral') { neutral++; continue }
    const aligned = (repVote === 'Yea') === (userVote === 'support')
    if (aligned) agreed++
    else disagreed++
  }

  const partyClass = PARTY_COLORS[rep.party ?? ''] ?? 'border-border text-muted-foreground'
  const chamberLabel = CHAMBER_LABELS[rep.chamber] ?? rep.chamber
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const repShareUrl = `${appUrl}/representatives/${id}`
  const repShareText = `Check out ${rep.fullName}'s voting record and sponsored bills on Project Knox:`

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
            <div className="shrink-0">
              <Avatar className="h-20 w-20 text-3xl">
                {rep.photoUrl && <AvatarImage src={rep.photoUrl} alt={rep.fullName} />}
                <AvatarFallback className="bg-navy-900 text-2xl font-bold text-white">
                  {rep.fullName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>

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
              {(() => {
                const sinceYear = rep.termStart
                  ? new Date(rep.termStart).getFullYear()
                  : earliestSession?.yearStart ?? null
                if (!sinceYear) return null
                const startDate = new Date(sinceYear, 0, 1)
                const end = rep.termEnd ? new Date(rep.termEnd) : null
                const isFormer = end !== null && end < new Date()
                const duration = formatTimeInOffice(startDate, end)
                return (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {isFormer
                      ? `Served ${sinceYear}–${end!.getFullYear()} · ${duration}`
                      : `In office since ${sinceYear} · ${duration}`}
                    {!isFormer && end && ` · Term ends ${end.getFullYear()}`}
                  </p>
                )
              })()}
            </div>
          </div>

          {(rep.phone ?? rep.email ?? rep.contactFormUrl ?? rep.websiteUrl) && (
            <>
              <Separator className="my-5" />
              <div className="flex flex-wrap gap-2">
                {rep.phone && (
                  <a href={`tel:${rep.phone}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                    <Phone className="h-4 w-4" />
                    {rep.phone}
                  </a>
                )}
                {rep.email && (
                  <a href={`mailto:${rep.email}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                    <Mail className="h-4 w-4" />
                    Email
                  </a>
                )}
                {rep.contactFormUrl && (
                  <a href={rep.contactFormUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                    <ExternalLink className="h-4 w-4" />
                    Contact form
                  </a>
                )}
                {rep.websiteUrl && (
                  <a href={rep.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors">
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

          <div className="mt-4">
            <ShareButtons title={rep.fullName} url={repShareUrl} text={repShareText} />
          </div>
        </CardContent>
      </Card>

      {/* Alignment card — only for logged-in users with data to compare */}
      {session && allBillIds.length > 0 && (
        <RepAlignmentCard
          repName={rep.fullName}
          agreed={agreed}
          disagreed={disagreed}
          neutral={neutral}
        />
      )}

      {/* Contact form */}
      {session && (
        <CollapsibleCard
          title="Send a message"
          description={`Contact ${rep.fullName} about any issue or upcoming bill.`}
          storageKey={`rep-${rep.id}-contact`}
        >
          <ContactForm rep={rep as unknown as Representative} />
        </CollapsibleCard>
      )}

      {/* Sponsored legislation — lazy-loaded, paginated */}
      <RepSponsoredBills repId={billsRepId} storageRepId={rep.id} />

      {/* Cosponsored legislation — lazy-loaded, paginated */}
      <RepCosponsoredBills repId={billsRepId} storageRepId={rep.id} />

      {/* Roll call voting history — lazy-loaded, paginated */}
      <RepVotingHistory repId={billsRepId} storageRepId={rep.id} />
    </div>
  )
}
