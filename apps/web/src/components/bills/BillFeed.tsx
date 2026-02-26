'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { BillCard } from './BillCard'
import { Loader2 } from 'lucide-react'
import type { BillListResponse } from '@project-knox/types'

interface BillFeedProps {
  forUser?: boolean
}

interface FetchParams {
  forUser?: boolean
  level?: string
  chamber?: string
  status?: string
  search?: string
  tags?: string
  page?: string
}

async function fetchBills(params: FetchParams): Promise<BillListResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const url = new URL('/api/bills', apiUrl)
  if (params.forUser) url.searchParams.set('forUser', 'true')
  if (params.level && params.level !== 'all') url.searchParams.set('level', params.level)
  if (params.chamber && params.chamber !== 'all') url.searchParams.set('chamber', params.chamber)
  if (params.status && params.status !== 'all') url.searchParams.set('status', params.status)
  if (params.search) url.searchParams.set('search', params.search)
  if (params.tags) url.searchParams.set('tags', params.tags)
  if (params.page) url.searchParams.set('page', params.page)
  url.searchParams.set('limit', '20')

  const response = await fetch(url.toString(), { credentials: 'include' })
  if (!response.ok) throw new Error('Failed to fetch bills')
  return response.json() as Promise<BillListResponse>
}

export function BillFeed({ forUser }: BillFeedProps) {
  // Read filter values directly from URL so BillFilters and BillFeed stay in sync
  const searchParams = useSearchParams()
  const level = searchParams.get('level') ?? undefined
  const chamber = searchParams.get('chamber') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const tags = searchParams.get('tags') ?? undefined
  const page = searchParams.get('page') ?? undefined

  const fetchKey = { forUser, level, chamber, status, search, tags, page }

  const { data, isLoading, error } = useQuery({
    queryKey: ['bills', fetchKey],
    queryFn: () => fetchBills(fetchKey),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-red-600">
        Failed to load bills. Please try again.
      </div>
    )
  }

  if (!data?.bills.length) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center text-gray-500">
        <p className="text-lg font-medium">No bills found</p>
        <p className="mt-1 text-sm">Try adjusting your filters or check back later.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {data.bills.map((bill) => (
        <BillCard key={bill.id} bill={bill} showVoting />
      ))}
      {data.hasMore && (
        <p className="py-4 text-center text-sm text-gray-400">
          Showing {data.bills.length} of {data.total} bills
        </p>
      )}
    </div>
  )
}
