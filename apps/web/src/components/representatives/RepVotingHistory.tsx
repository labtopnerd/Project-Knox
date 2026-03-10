'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'
import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number]

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1)
  let start = Math.max(1, current - 4)
  let end = start + 9
  if (end > total) { end = total; start = Math.max(1, end - 9) }
  const pages: (number | '...')[] = []
  if (start > 1) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total) pages.push('...')
  return pages
}

interface RollCallBill {
  id: string
  billNumber: string | null
  title: string
  status: string
}

interface RollCallSummary {
  rollCallId: number
  date: string
  description: string
  yea: number
  nay: number
  nv: number
  absent: number
  total: number
  passed: boolean
  chamber: string
  sessionId: number | null
  yearStart: number | null
  bill: RollCallBill
}

interface RepVoteRow {
  id: string
  voteText: string
  rollCall: RollCallSummary
}

interface VotesResponse {
  votes: RepVoteRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

interface SessionSummary {
  id: string
  sessionId: number
  yearStart: number
  yearEnd: number
  sessionTitle: string
  syncedAt: string | null
  voteCount: number
}

const VOTE_BADGE: Record<string, string> = {
  Yea: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Nay: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

function voteBadgeClass(voteText: string): string {
  return VOTE_BADGE[voteText] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

export function RepVotingHistory({ repId, storageRepId }: { repId: string; storageRepId: string }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSizeOption>(10)
  const [data, setData] = useState<VotesResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch session list once on mount
  useEffect(() => {
    apiFetch(`/api/representatives/${repId}/sessions`)
      .then((res) => res.json())
      .then((json: { sessions: SessionSummary[] }) => setSessions(json.sessions ?? []))
      .catch(() => {})
  }, [repId])

  const fetchPage = useCallback((p: number, size: PageSizeOption, sessionId: number | null) => {
    setLoading(true)
    const qs = new URLSearchParams({ page: String(p), pageSize: String(size) })
    if (sessionId != null) qs.set('sessionId', String(sessionId))
    apiFetch(`/api/representatives/${repId}/votes?${qs.toString()}`)
      .then((res) => res.json())
      .then((json: VotesResponse) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [repId])

  useEffect(() => { fetchPage(page, pageSize, selectedSessionId) }, [fetchPage, page, pageSize, selectedSessionId])

  // Poll sessions while syncing to pick up voteCount / syncedAt updates
  useEffect(() => {
    if (!syncing) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const res = await apiFetch(`/api/representatives/${repId}/sessions`)
        const json = await res.json() as { sessions: SessionSummary[] }
        setSessions(json.sessions ?? [])
        // Stop polling once the selected session is synced, or after ~5 minutes
        const target = json.sessions.find((s) => s.sessionId === selectedSessionId)
        if (target?.syncedAt || attempts >= 30) {
          setSyncing(false)
          if (target?.syncedAt) fetchPage(1, pageSize, selectedSessionId)
        }
      } catch { /* ignore */ }
    }, 10000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [syncing, repId, selectedSessionId, fetchPage, pageSize])

  async function handleSessionChange(sessionId: number | null) {
    setSelectedSessionId(sessionId)
    setPage(1)

    if (sessionId == null) return

    const session = sessions.find((s) => s.sessionId === sessionId)
    if (!session?.syncedAt) {
      // Trigger lazy history sync for this rep
      setSyncing(true)
      try {
        await apiFetch(`/api/representatives/${repId}/sync-history`, { method: 'POST' })
      } catch { /* polling will still show status */ }
    }
  }

  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId)
  const isSelectedUnsynced = selectedSession != null && !selectedSession.syncedAt
  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 1
  const title = loading || data === null ? 'Roll call votes' : `Roll call votes (${total})`

  return (
    <CollapsibleCard
      title={title}
      storageKey={`rep-${storageRepId}-votes-${selectedSessionId ?? 'all'}`}
    >
      {/* Session selector */}
      {sessions.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Session</span>
          <select
            value={selectedSessionId ?? ''}
            onChange={(e) => handleSessionChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
            className="rounded border border-input bg-background px-1.5 py-0.5 text-xs text-foreground"
          >
            <option value="">All time</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionTitle} ({s.yearStart}–{s.yearEnd})
                {s.syncedAt ? ` — ${s.voteCount} votes` : ' — not synced'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Syncing state for an unsynced session */}
      {isSelectedUnsynced && syncing ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Syncing historical votes — this may take a minute…
        </div>
      ) : isSelectedUnsynced ? (
        <p className="py-4 text-sm text-muted-foreground">
          Historical data for this session hasn't been synced yet.{' '}
          <button
            className="underline hover:no-underline"
            onClick={() => handleSessionChange(selectedSessionId)}
          >
            Sync now
          </button>
        </p>
      ) : loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse h-16 rounded-lg bg-muted" />
          ))}
        </div>
      ) : !data || data.votes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No roll call votes have been synced for this representative yet.
        </p>
      ) : (
        <>
          <div className="space-y-0">
            {data.votes.map((rv, idx) => {
              const rc = rv.rollCall
              const date = new Date(rc.date).toLocaleDateString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              })
              return (
                <div key={rv.id}>
                  {idx > 0 && <Separator className="my-1" />}
                  <div className="flex items-start gap-3 py-3">
                    {/* Pass/fail icon */}
                    <div className="mt-0.5 shrink-0">
                      {rc.passed
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        : <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                    </div>

                    {/* Bill info + description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        {rc.bill.billNumber && (
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {rc.bill.billNumber}
                          </span>
                        )}
                        <Link
                          href={`/bills/${rc.bill.id}`}
                          className="text-sm font-medium text-foreground hover:underline truncate"
                        >
                          {rc.bill.title}
                        </Link>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{rc.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {date} · {rc.yea}–{rc.nay} yea–nay
                      </p>
                    </div>

                    {/* Vote badge */}
                    <Badge className={`shrink-0 text-xs font-semibold ${voteBadgeClass(rv.voteText)}`}>
                      {rv.voteText}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Show</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const next = parseInt(e.target.value, 10) as PageSizeOption
                  setPageSize(next)
                  setPage(1)
                }}
                className="rounded border border-input bg-background px-1.5 py-0.5 text-xs text-foreground"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">per page</span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {getPageNumbers(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPage(p)}
                      className="min-w-[2rem] px-2 text-xs"
                    >
                      {p}
                    </Button>
                  )
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="ml-1 text-xs text-muted-foreground whitespace-nowrap">
                  of {totalPages}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  )
}
