import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillCard } from '@/components/bills/BillCard'
import { ContactForm } from '@/components/contact/ContactForm'
import { ChevronLeft, Phone, Mail, Globe, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Representative, BillWithUserVote } from '@project-knox/types'

export const dynamic = 'force-dynamic'

type Params = { id: string }

const PARTY_COLORS: Record<string, string> = {
  Democrat: 'bg-blue-100 text-blue-800',
  Republican: 'bg-red-100 text-red-800',
  Independent: 'bg-purple-100 text-purple-800',
}

const CHAMBER_LABELS: Record<string, string> = {
  senate: 'U.S. Senate',
  house: 'U.S. House of Representatives',
  state_senate: 'State Senate',
  state_house: 'State House',
  local: 'Local Government',
}

export async function generateMetadata({ params }: { params: Params }) {
  const rep = await prisma.representative.findUnique({
    where: { id: params.id },
    select: { fullName: true },
  })
  return { title: rep ? `${rep.fullName} — Representative` : 'Representative' }
}

export default async function RepDetailPage({ params }: { params: Params }) {
  const session = await auth()

  const rep = await prisma.representative.findUnique({
    where: { id: params.id },
    include: {
      sponsoredBills: {
        orderBy: { lastActionDate: 'desc' },
        take: 8,
        include: { aggregates: true },
      },
    },
  })

  if (!rep) notFound()

  // Fetch user votes for the sponsored bills if authenticated
  let userVotes: Record<string, string> = {}
  if (session?.user?.id && rep.sponsoredBills.length > 0) {
    const votes = await prisma.userVote.findMany({
      where: { userId: session.user.id, billId: { in: rep.sponsoredBills.map((b) => b.id) } },
      select: { billId: true, vote: true },
    })
    userVotes = Object.fromEntries(votes.map((v) => [v.billId, v.vote]))
  }

  const partyClass = PARTY_COLORS[rep.party ?? ''] ?? 'bg-gray-100 text-gray-700'
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
    <div className="mx-auto max-w-3xl">
      <Link
        href="/representatives"
        className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to my representatives
      </Link>

      {/* Profile card */}
      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex gap-5">
          {/* Photo */}
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
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 text-3xl font-bold text-gray-400">
                {rep.fullName.charAt(0)}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">
              {rep.title ? `${rep.title} ` : ''}{rep.fullName}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {chamberLabel}
              {rep.stateCode && ` — ${rep.stateCode}`}
              {rep.district && `, District ${rep.district}`}
            </p>
            {rep.party && (
              <span className={cn('mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', partyClass)}>
                {rep.party}
              </span>
            )}
          </div>
        </div>

        {/* Contact links */}
        <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-50 pt-5">
          {rep.phone && (
            <a
              href={`tel:${rep.phone}`}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Phone className="h-4 w-4" />
              {rep.phone}
            </a>
          )}
          {rep.email && (
            <a
              href={`mailto:${rep.email}`}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Globe className="h-4 w-4" />
              Website
            </a>
          )}
        </div>

        {rep.officeAddress && (
          <p className="mt-3 text-xs text-gray-400">{rep.officeAddress}</p>
        )}
      </div>

      {/* Contact form */}
      {session && (
        <section className="mb-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Send a message</h2>
          <p className="mb-5 text-sm text-gray-500">
            Contact {rep.title ?? rep.fullName} about any issue or upcoming bill.
          </p>
          <ContactForm rep={rep as unknown as Representative} />
        </section>
      )}

      {/* Sponsored bills */}
      {billsWithVotes.length > 0 && (
        <section>
          <h2 className="mb-4 text-base font-semibold text-gray-900">
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
