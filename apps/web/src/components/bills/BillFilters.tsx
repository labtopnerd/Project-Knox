'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '')

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
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitSearch(searchInput) }}
          onBlur={() => commitSearch(searchInput)}
          placeholder="Search bills by keyword…"
          className="pl-9 pr-9"
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); commitSearch('') }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown filters + clear */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={params.get('level') ?? 'all'}
          onValueChange={(v) => setFilter('level', v)}
        >
          <SelectTrigger className="w-36" aria-label="Filter by level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={params.get('chamber') ?? 'all'}
          onValueChange={(v) => setFilter('chamber', v)}
        >
          <SelectTrigger className="w-36" aria-label="Filter by chamber">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHAMBERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={params.get('status') ?? 'all'}
          onValueChange={(v) => setFilter('status', v)}
        >
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="gap-1.5 text-slate-500 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      {/* Issue tag pills */}
      <div className="flex flex-wrap gap-1.5">
        {ISSUE_TAGS.map((tag) => (
          <button key={tag} onClick={() => toggleTag(tag)} className="focus:outline-none">
            <Badge
              variant={activeTags.has(tag) ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer text-xs transition-colors',
                activeTags.has(tag)
                  ? 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-blue-600 dark:hover:bg-blue-500'
                  : 'border-slate-300 text-slate-600 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-700 dark:border-slate-600 dark:text-slate-400',
              )}
            >
              {tag}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  )
}
