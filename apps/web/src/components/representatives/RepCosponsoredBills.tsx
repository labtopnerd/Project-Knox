'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BillStatusBadge } from '@/components/bills/BillStatusBadge'

interface BillListItem {
  id: string
  billNumber: string | null
  title: string
  status: string
  chamber: string | null
  stateCode: string | null
  introducedDate: string | null
  lastActionDate: string | null
  joinedAt: string | null
  issueTags: string[]
}

interface BillsResponse {
  bills: BillListItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export function RepCosponsoredBills({ repId, storageRepId }: { repId: string; storageRepId: string }) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<BillsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPage = useCallback((p: number) => {
    setLoading(true)
    apiFetch(`/api/representatives/${repId}/cosponsored?page=${p}`)
      .then((res) => res.json())
      .then((json: BillsResponse) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [repId])

  useEffect(() => { fetchPage(page) }, [fetchPage, page])

  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 1
  const title = loading || data === null ? 'Cosponsored bills' : `Cosponsored bills (${total})`

  return (
    <CollapsibleCard
      title={title}
      description="Bills they co-signed — a formal endorsement of support."
      defaultOpen
      storageKey={`rep-${storageRepId}-cosponsored`}
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse h-14 rounded-lg bg-muted" />
          ))}
        </div>
      ) : !data || data.bills.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cosponsored bills synced yet.</p>
      ) : (
        <>
          <div className="space-y-0">
            {data.bills.map((bill, idx) => (
              <div key={bill.id}>
                {idx > 0 && <Separator className="my-1" />}
                <BillRow bill={bill} />
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </CollapsibleCard>
  )
}

function BillRow({ bill }: { bill: BillListItem }) {
  const date = bill.joinedAt ?? bill.lastActionDate
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : null

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-1.5">
          {bill.billNumber && (
            <span className="font-mono text-xs font-semibold text-muted-foreground">{bill.billNumber}</span>
          )}
          <Link href={`/bills/${bill.id}`} className="text-sm font-medium text-foreground hover:underline line-clamp-1">
            {bill.title}
          </Link>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {formattedDate && <span className="text-xs text-muted-foreground">{bill.joinedAt ? `Joined ${formattedDate}` : formattedDate}</span>}
          {bill.issueTags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <BillStatusBadge status={bill.status} />
    </div>
  )
}
