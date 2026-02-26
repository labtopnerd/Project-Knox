'use client'

import Link from 'next/link'
import { Calendar, MapPin, ExternalLink } from 'lucide-react'
import { VoteButtons } from './VoteButtons'
import { VoteResultsBar } from './VoteResultsBar'
import { BillStatusBadge } from './BillStatusBadge'
import { cn } from '@/lib/utils'
import type { BillWithUserVote } from '@project-knox/types'

interface BillCardProps {
  bill: BillWithUserVote
  showVoting?: boolean
}

export function BillCard({ bill, showVoting = true }: BillCardProps) {
  const chamberLabel = {
    house: 'U.S. House',
    senate: 'U.S. Senate',
    state_house: `${bill.stateCode} House`,
    state_senate: `${bill.stateCode} Senate`,
  }[bill.chamber ?? ''] ?? bill.chamber

  return (
    <article className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {bill.billNumber && (
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              {bill.billNumber}
            </span>
          )}
          <Link
            href={`/bills/${bill.id}`}
            className="text-base font-semibold text-gray-900 hover:text-primary-600 line-clamp-2"
          >
            {bill.title}
          </Link>
        </div>
        <BillStatusBadge status={bill.status} />
      </div>

      {/* Summary */}
      {bill.summary && (
        <p className="mb-4 text-sm text-gray-600 line-clamp-3">{bill.summary}</p>
      )}

      {/* Meta */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-400">
        {chamberLabel && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {chamberLabel}
          </span>
        )}
        {bill.lastActionDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(bill.lastActionDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        )}
        {bill.sponsorName && (
          <span>Sponsor: {bill.sponsorName}</span>
        )}
        {bill.url && (
          <a
            href={bill.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-primary-600"
          >
            <ExternalLink className="h-3 w-3" />
            Official page
          </a>
        )}
      </div>

      {/* Tags */}
      {bill.issueTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {bill.issueTags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Poll results */}
      {bill.aggregates && (
        <div className="mb-4">
          <VoteResultsBar
            supportCount={bill.aggregates.supportCount}
            opposeCount={bill.aggregates.opposeCount}
            neutralCount={bill.aggregates.neutralCount}
            totalCount={bill.aggregates.totalCount}
            compact
          />
        </div>
      )}

      {/* Vote buttons */}
      {showVoting && (
        <div className="border-t border-gray-50 pt-4">
          <VoteButtons billId={bill.id} currentVote={bill.userVote} aggregates={bill.aggregates} />
        </div>
      )}
    </article>
  )
}
