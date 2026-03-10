/**
 * Admin dashboard — bill sync health, user metrics, and quick actions.
 *
 * Access is restricted to emails listed in the ADMIN_EMAILS env var
 * (comma-separated). Falls back to blocking all access if the var is unset.
 */

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean)

type SyncLog = {
  id: string
  job: string
  status: string
  startedAt: string
  completedAt: string | null
  durationMs: number | null
  result: Record<string, number> | null
  error: string | null
}

async function getSyncLogs(): Promise<SyncLog[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const cronSecret = process.env.CRON_SECRET ?? ''
  try {
    const res = await fetch(`${apiUrl}/api/sync/logs`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.logs ?? []
  } catch {
    return []
  }
}

async function getStats() {
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalBills,
    billsBySource,
    billsByStatus,
    recentBills,
    totalUsers,
    usersWithLocation,
    totalVotes,
    votesLast24h,
    votesLast7d,
    totalMessages,
    lastSyncedBill,
    deviceTokenCount,
  ] = await Promise.all([
    prisma.bill.count(),
    prisma.bill.groupBy({ by: ['source'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.bill.groupBy({ by: ['status'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.bill.count({ where: { createdAt: { gte: last24h } } }),
    prisma.user.count(),
    prisma.userProfile.count({ where: { stateCode: { not: null } } }),
    prisma.userVote.count(),
    prisma.userVote.count({ where: { createdAt: { gte: last24h } } }),
    prisma.userVote.count({ where: { createdAt: { gte: last7d } } }),
    prisma.sentMessage.count(),
    prisma.bill.findFirst({ orderBy: { lastSyncedAt: 'desc' }, select: { lastSyncedAt: true, source: true } }),
    prisma.deviceToken.count(),
  ])

  return {
    bills: { total: totalBills, bySource: billsBySource, byStatus: billsByStatus, last24h: recentBills },
    users: { total: totalUsers, withLocation: usersWithLocation, deviceTokens: deviceTokenCount },
    votes: { total: totalVotes, last24h: votesLast24h, last7d: votesLast7d },
    messages: { total: totalMessages },
    sync: { lastSyncedAt: lastSyncedBill?.lastSyncedAt ?? null, lastSource: lastSyncedBill?.source ?? null },
  }
}

function SyncStatusBadge({ status }: { status: string }) {
  const styles =
    status === 'completed'
      ? 'bg-green-100 text-green-700'
      : status === 'running'
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles}`}>
      {status}
    </span>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userEmail = session.user.email ?? ''
  if (ADMIN_EMAILS.length === 0 || !ADMIN_EMAILS.includes(userEmail)) {
    redirect('/feed')
  }

  const [stats, syncLogs] = await Promise.all([getStats(), getSyncLogs()])

  const lastSyncDisplay = stats.sync.lastSyncedAt
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(new Date(stats.sync.lastSyncedAt))
    : 'Never'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Sync health, user metrics, and quick actions</p>
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
          Live
        </span>
      </div>

      {/* Sync health */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Bill sync</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total bills" value={stats.bills.total} />
          <StatCard label="Added (24h)" value={stats.bills.last24h} />
          <StatCard
            label="Last sync"
            value={lastSyncDisplay}
            sub={stats.sync.lastSource ? `Source: ${stats.sync.lastSource}` : undefined}
          />
          <StatCard label="Device tokens" value={stats.users.deviceTokens} sub="Push-enabled devices" />
        </div>

        {/* Bills by source */}
        <div className="mt-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Bills by data source</h3>
          <div className="space-y-2">
            {stats.bills.bySource.map((row) => (
              <div key={row.source} className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize text-gray-700">{row.source}</span>
                <span className="tabular-nums text-gray-500">{row._count.id.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bills by status */}
        <div className="mt-4 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Bills by status</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {stats.bills.byStatus.map((row) => (
              <div key={row.status} className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-600">{row.status.replace(/_/g, ' ')}</span>
                <span className="tabular-nums font-medium text-gray-800">{row._count.id.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* User & engagement metrics */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Users & engagement</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total users" value={stats.users.total} />
          <StatCard
            label="With location"
            value={stats.users.withLocation}
            sub={`${stats.users.total > 0 ? Math.round((stats.users.withLocation / stats.users.total) * 100) : 0}% of users`}
          />
          <StatCard label="Total votes" value={stats.votes.total} />
          <StatCard label="Votes (7d)" value={stats.votes.last7d} sub={`${stats.votes.last24h} in last 24h`} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="Messages sent" value={stats.messages.total} />
          <StatCard
            label="Avg votes / user"
            value={stats.users.total > 0 ? (stats.votes.total / stats.users.total).toFixed(1) : '0'}
          />
          <StatCard
            label="Location rate"
            value={`${stats.users.total > 0 ? Math.round((stats.users.withLocation / stats.users.total) * 100) : 0}%`}
            sub="Users who set address"
          />
        </div>
      </section>

      {/* Quick actions */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <TriggerSyncButton />
          <Link
            href="/feed"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Back to feed
          </Link>
        </div>
      </section>

      {/* Sync history */}
      <section className="mb-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Sync history</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          {syncLogs.length === 0 ? (
            <p className="p-5 text-sm text-gray-400">No sync logs found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Job</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3 text-right">Synced</th>
                  <th className="px-4 py-3 text-right">Skipped</th>
                  <th className="px-4 py-3 text-right">Errors</th>
                  <th className="px-4 py-3 text-left">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {syncLogs.map((log) => {
                  const synced = log.result
                    ? (log.result.federalSynced ?? 0) + (log.result.stateSynced ?? 0) + (log.result.synced ?? 0)
                    : null
                  const skipped = log.result?.federalSkipped ?? null
                  const errors = log.result
                    ? (log.result.federalErrors ?? 0) + (log.result.stateErrors ?? 0)
                    : null
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{log.job}</td>
                      <td className="px-4 py-3">
                        <SyncStatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {new Intl.DateTimeFormat('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        }).format(new Date(log.startedAt))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {log.durationMs != null ? `${(log.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {synced != null ? synced.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                        {skipped != null ? skipped.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                        {errors != null ? errors.toLocaleString() : '—'}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-xs text-red-600">
                        {log.error ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

// Server-side trigger for manual sync via the cron route
function TriggerSyncButton() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const cronSecret = process.env.CRON_SECRET ?? ''

  return (
    <form
      action={async () => {
        'use server'
        try {
          await fetch(`${apiUrl}/api/sync/bills`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cronSecret}` },
          })
        } catch {
          // Sync is fire-and-forget from the admin UI
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
      >
        ⚡ Trigger bill sync
      </button>
    </form>
  )
}
