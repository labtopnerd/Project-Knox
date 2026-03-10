'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'

/**
 * Invisible component that fires on-demand AI enrichment when a bill page
 * is loaded for a bill that hasn't been enriched yet. Refreshes the page
 * after enrichment completes so the AI sections appear without a reload.
 */
export function BillEnrichTrigger({ billId }: { billId: string }) {
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/bills/${billId}/enrich`, { method: 'POST' })
      .then((res) => res.json())
      .then((data: { enriched?: boolean; already?: boolean }) => {
        if (!cancelled && data.enriched) router.refresh()
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [billId, router])

  return null
}
