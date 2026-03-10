'use client'

import Link from 'next/link'
import { Calendar, MapPin, ExternalLink } from 'lucide-react'
import { VoteButtons } from './VoteButtons'
import { VoteResultsBar } from './VoteResultsBar'
import { BillStatusBadge } from './BillStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import type { BillWithUserVote } from '@project-knox/types'
import { stripHtml } from '@/lib/utils'

interface BillCardProps {
  bill: BillWithUserVote
  showVoting?: boolean
}

export function BillCard({ bill, showVoting = true }: BillCardProps) {
  const CHAMBER_LABELS: Record<string, string> = {
    house: 'U.S. House',
    senate: 'U.S. Senate',
    state_house: `${bill.stateCode} House`,
    state_senate: `${bill.stateCode} Senate`,
  }
  const chamberLabel = bill.chamber ? (CHAMBER_LABELS[bill.chamber] ?? bill.chamber) : undefined

  return (
    <Card className="border-slate-200 bg-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {bill.billNumber && (
              <span className="mb-1 block font-mono text-xs font-semibold uppercase tracking-wide text-navy-900 dark:text-blue-400">
                {bill.billNumber}
              </span>
            )}
            <Link
              href={`/bills/${bill.id}`}
              className="text-base font-semibold text-slate-900 hover:text-navy-900 line-clamp-2 dark:text-white dark:hover:text-blue-400"
            >
              {bill.title}
            </Link>
          </div>
          <BillStatusBadge status={bill.status} />
        </div>
      </CardHeader>

      <CardContent className="pb-3 pt-0">
        {/* Summary */}
        {bill.summary && (
          <p className="mb-4 text-sm text-slate-600 line-clamp-3 dark:text-slate-400">{stripHtml(bill.summary)}</p>
        )}

        {/* Meta */}
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
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
          {bill.sponsorName && <span>Sponsor: {bill.sponsorName}</span>}
          {bill.url && (
            <a
              href={bill.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-navy-900 dark:hover:text-blue-400"
            >
              <ExternalLink className="h-3 w-3" />
              Official page
            </a>
          )}
        </div>

        {/* Issue tags */}
        {bill.issueTags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {bill.issueTags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Poll results */}
        {bill.aggregates && (
          <VoteResultsBar
            supportCount={bill.aggregates.supportCount}
            opposeCount={bill.aggregates.opposeCount}
            neutralCount={bill.aggregates.neutralCount}
            totalCount={bill.aggregates.totalCount}
            compact
          />
        )}
      </CardContent>

      {showVoting && (
        <CardFooter className="border-t border-slate-100 pt-3 dark:border-slate-700">
          <VoteButtons billId={bill.id} currentVote={bill.userVote} aggregates={bill.aggregates} />
        </CardFooter>
      )}
    </Card>
  )
}
