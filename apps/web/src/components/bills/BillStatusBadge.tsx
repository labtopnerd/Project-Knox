import { Badge } from '@/components/ui/badge'
import type { BillStatus } from '@project-knox/types'

const STATUS_CONFIG: Record<
  BillStatus,
  { label: string; className: string }
> = {
  introduced:     { label: 'Introduced',       className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' },
  committee:      { label: 'In Committee',     className: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800' },
  floor:          { label: 'Floor Vote',       className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800' },
  passed_chamber: { label: 'Passed Chamber',   className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800' },
  passed:         { label: 'Passed',           className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800' },
  failed:         { label: 'Failed',           className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800' },
  signed:         { label: 'Signed into Law',  className: 'bg-green-100 text-green-800 border-green-300 font-semibold dark:bg-green-900 dark:text-green-200 dark:border-green-700' },
  vetoed:         { label: 'Vetoed',           className: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900 dark:text-red-200 dark:border-red-700' },
  unknown:        { label: 'Unknown',          className: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
}

interface BillStatusBadgeProps {
  status: string
}

export function BillStatusBadge({ status }: BillStatusBadgeProps) {
  const config = STATUS_CONFIG[status as BillStatus] ?? {
    label: status,
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  }

  return (
    <Badge
      variant="outline"
      className={`shrink-0 text-xs ${config.className}`}
    >
      {config.label}
    </Badge>
  )
}
