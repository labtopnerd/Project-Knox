'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useState, useEffect } from 'react'

const LEVELS = [
  { value: 'all', label: 'All Levels' },
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
  { value: 'passed_chamber', label: 'Passed Chamber' },
  { value: 'passed', label: 'Passed' },
  { value: 'signed', label: 'Signed' },
]

const ISSUE_TAGS = [
  'healthcare', 'economy', 'environment', 'education', 'defense',
  'immigration', 'infrastructure', 'taxation', 'housing', 'energy',
]

export function BillFilters() {
  const router = useRouter()
  const params = useSearchParams()

  // Local state for search input to avoid pushing on every keystroke
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '')

  // Keep local state in sync if URL changes (e.g., back/forward nav)
  useEffect(() => {
    setSearchInput(params.get('search') ?? '')
  }, [params])

  const setFilter = (key: string, value: string) => {
    const current = new URLSearchParams(params.toString())
    if (value === 'all' || value === '') {
      current.delete(key)
    } else {
      current.set(key, value)
    }
    current.delete('page')
    router.push(`?${current.toString()}`, { scroll: false })
  }

  const commitSearch = (value: string) => {
    const current = new URLSearchParams(params.toString())
    if (value.trim()) {
      current.set('search', value.trim())
    } else {
      current.delete('search')
    }
    current.delete('page')
    router.push(`?${current.toString()}`, { scroll: false })
  }

  const toggleTag = (tag: string) => {
    const current = new URLSearchParams(params.toString())
    const tagSet = new Set((current.get('tags') ?? '').split(',').filter(Boolean))
    tagSet.has(tag) ? tagSet.delete(tag) : tagSet.add(tag)
    if (tagSet.size === 0) {
      current.delete('tags')
    } else {
      current.set('tags', [...tagSet].join(','))
    }
    current.delete('page')
    router.push(`?${current.toString()}`, { scroll: false })
  }

  const hasActiveFilters =
    params.has('level') || params.has('chamber') || params.has('status') ||
    params.has('search') || params.has('tags')

  const clearAll = () => {
    router.push('?', { scroll: false })
    setSearchInput('')
  }

  const activeTags = new Set((params.get('tags') ?? '').split(',').filter(Boolean))

  return (
    <div className="mb-6 space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(searchInput) }}
          onBlur={() => commitSearch(searchInput)}
          placeholder="Search bills by keyword…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); commitSearch('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown filters + clear */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={params.get('level') ?? 'all'}
          onChange={(e) => setFilter('level', e.target.value)}
          aria-label="Filter by level"
        >
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>

        <select
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={params.get('chamber') ?? 'all'}
          onChange={(e) => setFilter('chamber', e.target.value)}
          aria-label="Filter by chamber"
        >
          {CHAMBERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <select
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={params.get('status') ?? 'all'}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>

      {/* Issue tag pills */}
      <div className="flex flex-wrap gap-1.5">
        {ISSUE_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              activeTags.has(tag)
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-gray-200 text-gray-500 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
