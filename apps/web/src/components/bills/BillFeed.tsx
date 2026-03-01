'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { BillCard } from './BillCard'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { BillListResponse } from '@project-knox/types'
import { apiFetch } from '@/lib/api-client'

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
  const query = new URLSearchParams()
  if (params.forUser) query.set('forUser', 'true')
  if (params.level && params.level !== 'all') query.set('level', params.level)
  if (params.chamber && params.chamber !== 'all') query.set('chamber', params.chamber)
  if (params.status && params.status !== 'all') query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  if (params.tags) query.set('tags', params.tags)
  if (params.page) query.set('page', params.page)
  query.set('limit', '20')

  const response = await apiFetch(`/api/bills?${query.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch bills')
  return response.json() as Promise<BillListResponse>
}

export function BillFeed({ forUser }: BillFeedProps) {
  // Read filter values directly from URL so BillFilters and BillFeed stay in sync
  const searchParams = useSearchParams()
  const router = useRouter()
  const level = searchParams.get('level') ?? undefined
  const chamber = searchParams.get('chamber') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const search = searchParams.get('search') ?? undefined
  const tags = searchParams.get('tags') ?? undefined
  const page = searchParams.get('page') ?? '1'
  const currentPage = Math.max(1, parseInt(page, 10) || 1)

  const fetchKey = { forUser, level, chamber, status, search, tags, page }

  const { data, isLoading, error } = useQuery({
    queryKey: ['bills', fetchKey],
    queryFn: () => fetchBills(fetchKey),
  })

  const goToPage = (newPage: number) => {
    const current = new URLSearchParams(searchParams.toString())
    if (newPage <= 1) {
      current.delete('page')
    } else {
      current.set('page', String(newPage))
    }
    router.push(`?${current.toString()}`, { scroll: false })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalPages = data ? Math.ceil(data.total / 20) : 1

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

      {/* Pagination controls */}
      {data.total > 20 && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-400">
            Page {currentPage} of {totalPages} &middot; {data.total.toLocaleString()} bills
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={!data.hasMore}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
