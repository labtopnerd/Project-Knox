'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle, MapPin, Bell, User, History } from 'lucide-react'

interface UserProfile {
  zipCode?: string
  stateCode?: string
  notificationNewBills: boolean
  notificationBillUpdates: boolean
  notificationEmail: boolean
}

interface SentMessage {
  id: string
  sentAt: string
  channel: string
  subject?: string
  body: string
  representative: { fullName: string; stateCode?: string | null; chamber: string }
  bill?: { billNumber?: string | null; title: string } | null
}

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [messages, setMessages] = useState<SentMessage[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedProfile, setSavedProfile] = useState(false)

  // Location lookup state
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    Promise.all([
      fetch(`${apiUrl}/api/users/me`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`${apiUrl}/api/users/me/messages?limit=10`, { credentials: 'include' }).then((r) => r.json()),
    ]).then(([userData, msgData]) => {
      if (userData.user?.profile) {
        setProfile({
          zipCode: userData.user.profile.zipCode ?? '',
          stateCode: userData.user.profile.stateCode ?? '',
          notificationNewBills: userData.user.profile.notificationNewBills ?? true,
          notificationBillUpdates: userData.user.profile.notificationBillUpdates ?? true,
          notificationEmail: userData.user.profile.notificationEmail ?? true,
        })
      } else {
        setProfile({
          zipCode: '',
          stateCode: '',
          notificationNewBills: true,
          notificationBillUpdates: true,
          notificationEmail: true,
        })
      }
      if (msgData.messages) setMessages(msgData.messages as SentMessage[])
      setLoadingProfile(false)
    }).catch(() => setLoadingProfile(false))
  }, [status])

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lookupInput.trim()) return

    setLookupLoading(true)
    setLookupResult(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      const isZip = /^\d{5}$/.test(lookupInput.trim())
      const body = isZip ? { zipCode: lookupInput.trim() } : { address: lookupInput.trim() }

      const res = await fetch(`${apiUrl}/api/representatives/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      const data = await res.json() as {
        location?: { stateCode: string; matchedAddress: string }
        representatives?: unknown[]
        error?: string
      }

      if (!res.ok || data.error) {
        setLookupResult('Could not find representatives for that location. Try a full address.')
      } else {
        const count = data.representatives?.length ?? 0
        setLookupResult(
          `Found ${count} representative${count !== 1 ? 's' : ''} for ${data.location?.matchedAddress ?? lookupInput}. Your feed has been updated.`,
        )
        if (profile && data.location?.stateCode) {
          setProfile({ ...profile, stateCode: data.location.stateCode })
        }
      }
    } catch {
      setLookupResult('Something went wrong. Please try again.')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSaveNotifications = async () => {
    if (!profile) return
    setSavingProfile(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      await fetch(`${apiUrl}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          notificationNewBills: profile.notificationNewBills,
          notificationBillUpdates: profile.notificationBillUpdates,
          notificationEmail: profile.notificationEmail,
        }),
      })
      setSavedProfile(true)
      setTimeout(() => setSavedProfile(false), 3000)
    } finally {
      setSavingProfile(false)
    }
  }

  if (status === 'loading' || loadingProfile) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Account */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <User className="h-4 w-4" />
          Account
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-1">
            <span className="text-gray-500">Name</span>
            <span className="font-medium text-gray-900">{session?.user?.name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-gray-500">Email</span>
            <span className="font-medium text-gray-900">{session?.user?.email}</span>
          </div>
          {profile?.stateCode && (
            <div className="flex items-center justify-between py-1">
              <span className="text-gray-500">State</span>
              <span className="font-medium text-gray-900">{profile.stateCode}</span>
            </div>
          )}
        </div>
      </section>

      {/* Location */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm" id="location">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-gray-900">
          <MapPin className="h-4 w-4" />
          Your location
        </h2>
        <p className="mb-5 text-sm text-gray-500">
          Enter your address or zip code to find your representatives and personalize your feed.
        </p>
        <form onSubmit={handleLookup} className="flex gap-2">
          <input
            type="text"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="Enter address or zip code…"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={lookupLoading || !lookupInput.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find reps'}
          </button>
        </form>
        {lookupResult && (
          <p className="mt-3 text-sm text-gray-600">{lookupResult}</p>
        )}
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <Bell className="h-4 w-4" />
          Notifications
        </h2>
        {profile && (
          <div className="space-y-4">
            {(
              [
                { key: 'notificationNewBills', label: 'New bills from my representatives' },
                { key: 'notificationBillUpdates', label: 'Bill status changes (passed, signed, etc.)' },
                { key: 'notificationEmail', label: 'Send alerts by email' },
              ] as { key: keyof UserProfile; label: string }[]
            ).map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center justify-between">
                <span className="text-sm text-gray-700">{label}</span>
                <button
                  role="switch"
                  aria-checked={profile[key] as boolean}
                  onClick={() => setProfile({ ...profile, [key]: !profile[key] })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    profile[key] ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      profile[key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </label>
            ))}

            <div className="pt-2">
              <button
                onClick={handleSaveNotifications}
                disabled={savingProfile}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : savedProfile ? (
                  <CheckCircle className="h-4 w-4" />
                ) : null}
                {savedProfile ? 'Saved!' : 'Save preferences'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Message history */}
      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm" id="messages">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
          <History className="h-4 w-4" />
          Recent messages sent
        </h2>
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 italic">
            You haven&apos;t contacted any representatives yet.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm"
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-400">
                  <span>
                    To:{' '}
                    <span className="font-medium text-gray-700">{msg.representative.fullName}</span>
                    {msg.representative.stateCode && ` (${msg.representative.stateCode})`}
                  </span>
                  <span>{new Date(msg.sentAt).toLocaleDateString()}</span>
                </div>
                {msg.bill && (
                  <p className="mb-1 text-xs text-gray-500">
                    Re: {msg.bill.billNumber ? `${msg.bill.billNumber} — ` : ''}{msg.bill.title}
                  </p>
                )}
                {msg.subject && (
                  <p className="font-medium text-gray-800">{msg.subject}</p>
                )}
                <p className="line-clamp-2 text-gray-600">{msg.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
