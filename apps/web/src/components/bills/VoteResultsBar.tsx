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
      <div className="text-sm text-gray-400 italic">
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
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {supportPct > 0 && (
          <div
            className="bg-support transition-all duration-500"
            style={{ width: `${supportPct}%` }}
            title={`Support: ${supportPct}%`}
          />
        )}
        {neutralPct > 0 && (
          <div
            className="bg-gray-300 transition-all duration-500"
            style={{ width: `${neutralPct}%` }}
            title={`Neutral: ${neutralPct}%`}
          />
        )}
        {opposePct > 0 && (
          <div
            className="bg-oppose transition-all duration-500"
            style={{ width: `${opposePct}%` }}
            title={`Oppose: ${opposePct}%`}
          />
        )}
      </div>

      {/* Labels */}
      {showCounts && (
        <div className="flex items-center justify-between text-gray-500">
          <span className="text-support font-medium">{supportPct}% Support</span>
          <span className="text-gray-400">{totalCount.toLocaleString()} votes</span>
          <span className="text-oppose font-medium">{opposePct}% Oppose</span>
        </div>
      )}
    </div>
  )
}
