'use client'

import { cn } from '@/lib/utils'

interface VoteResultsBarProps {
  supportCount: number
  opposeCount: number
  neutralCount: number
  totalCount: number
  showCounts?: boolean
  compact?: boolean
}

export function VoteResultsBar({
  supportCount,
  opposeCount,
  neutralCount,
  totalCount,
  showCounts = true,
  compact = false,
}: VoteResultsBarProps) {
  if (totalCount === 0) {
    return (
      <div className="text-sm italic text-slate-400 dark:text-slate-500">
        No votes yet — be the first to weigh in
      </div>
    )
  }

  const supportPct = Math.round((supportCount / totalCount) * 100)
  const opposePct = Math.round((opposeCount / totalCount) * 100)
  const neutralPct = 100 - supportPct - opposePct

  return (
    <div className={cn('space-y-1', compact ? 'text-xs' : 'text-sm')}>
      {/* Bar */}
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        {supportPct > 0 && (
          <div
            className="rounded-full bg-support transition-all duration-500"
            style={{ width: `${supportPct}%` }}
            title={`Support: ${supportPct}%`}
          />
        )}
        {neutralPct > 0 && (
          <div
            className="rounded-full bg-slate-300 transition-all duration-500 dark:bg-slate-500"
            style={{ width: `${neutralPct}%` }}
            title={`Neutral: ${neutralPct}%`}
          />
        )}
        {opposePct > 0 && (
          <div
            className="rounded-full bg-oppose transition-all duration-500"
            style={{ width: `${opposePct}%` }}
            title={`Oppose: ${opposePct}%`}
          />
        )}
      </div>

      {/* Labels */}
      {showCounts && (
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="font-medium text-support">{supportPct}% Support</span>
          <span className="text-slate-400 dark:text-slate-500">{totalCount.toLocaleString()} votes</span>
          <span className="font-medium text-oppose">{opposePct}% Oppose</span>
        </div>
      )}
    </div>
  )
}
