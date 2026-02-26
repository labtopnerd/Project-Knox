'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const LEVELS = [
  { value: 'all', label: 'All' },
  { value: 'federal', label: 'Federal' },
  { value: 'state', label: 'State' },
]

const CHAMBERS = [
  { value: 'all', label: 'All Chambers' },
  { value: 'house', label: 'House' },
  { value: 'senate', label: 'Senate' },
]

const STATUSES = [
  { value: 'all', label: 'All Status' },
  { value: 'introduced', label: 'Introduced' },
  { value: 'committee', label: 'In Committee' },
  { value: 'floor', label: 'Floor Vote' },
  { value: 'passed', label: 'Passed' },
  { value: 'signed', label: 'Signed into Law' },
]

export function BillFilters() {
  const router = useRouter()
  const params = useSearchParams()

  const setFilter = (key: string, value: string) => {
    const current = new URLSearchParams(params.toString())
    if (value === 'all') {
      current.delete(key)
    } else {
      current.set(key, value)
    }
    router.push(`?${current.toString()}`, { scroll: false })
  }

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <select
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        value={params.get('level') ?? 'all'}
        onChange={(e) => setFilter('level', e.target.value)}
        aria-label="Filter by level"
      >
        {LEVELS.map((l) => (
          <option key={l.value} value={l.value}>{l.label}</option>
        ))}
      </select>

      <select
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        value={params.get('chamber') ?? 'all'}
        onChange={(e) => setFilter('chamber', e.target.value)}
        aria-label="Filter by chamber"
      >
        {CHAMBERS.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      <select
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        value={params.get('status') ?? 'all'}
        onChange={(e) => setFilter('status', e.target.value)}
        aria-label="Filter by status"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </div>
  )
}
