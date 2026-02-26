import { cn } from '@/lib/utils'
import type { BillStatus } from '@project-knox/types'

const STATUS_CONFIG: Record<
  BillStatus,
  { label: string; className: string }
> = {
  introduced: { label: 'Introduced', className: 'bg-blue-50 text-blue-700' },
  committee: { label: 'In Committee', className: 'bg-yellow-50 text-yellow-700' },
  floor: { label: 'Floor Vote', className: 'bg-orange-50 text-orange-700' },
  passed_chamber: { label: 'Passed Chamber', className: 'bg-indigo-50 text-indigo-700' },
  passed: { label: 'Passed', className: 'bg-green-50 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700' },
  signed: { label: 'Signed into Law', className: 'bg-green-100 text-green-800 font-semibold' },
  vetoed: { label: 'Vetoed', className: 'bg-red-100 text-red-800' },
  unknown: { label: 'Unknown', className: 'bg-gray-50 text-gray-600' },
}

interface BillStatusBadgeProps {
  status: string
}

export function BillStatusBadge({ status }: BillStatusBadgeProps) {
  const config = STATUS_CONFIG[status as BillStatus] ?? {
    label: status,
    className: 'bg-gray-50 text-gray-600',
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
      )}
    >
      {config.label}
    </span>
  )
}
