'use client'

import { useQuery } from '@tanstack/react-query'
import { BillCard } from './BillCard'
import { Loader2 } from 'lucide-react'
import type { BillListResponse } from '@project-knox/types'

interface BillFeedProps {
  forUser?: boolean
  stateCode?: string
  level?: 'federal' | 'state' | 'all'
}

async function fetchBills(params: BillFeedProps): Promise<BillListResponse> {
  const url = new URL('/api/bills', process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001')
  if (params.forUser) url.searchParams.set('forUser', 'true')
  if (params.stateCode) url.searchParams.set('stateCode', params.stateCode)
  if (params.level) url.searchParams.set('level', params.level)
  url.searchParams.set('limit', '20')

  const response = await fetch(url.toString(), { credentials: 'include' })
  if (!response.ok) throw new Error('Failed to fetch bills')
  return response.json() as Promise<BillListResponse>
}

export function BillFeed({ forUser, stateCode, level }: BillFeedProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bills', { forUser, stateCode, level }],
    queryFn: () => fetchBills({ forUser, stateCode, level }),
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
        <div className="py-4 text-center text-sm text-gray-400">
          Showing {data.bills.length} of {data.total} bills
        </div>
      )}
    </div>
  )
}
