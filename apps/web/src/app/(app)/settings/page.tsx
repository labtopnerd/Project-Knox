'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle, MapPin, Bell, User, History, Check, RotateCcw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface UserProfile {
  zipCode?: string
  stateCode?: string
  matchedAddress?: string
  notificationNewBills: boolean
  notificationBillUpdates: boolean
  notificationEmail: boolean
}

interface PendingLocation {
  matchedAddress: string
  stateCode: string
  repCount: number
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

  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [pendingLocation, setPendingLocation] = useState<PendingLocation | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return

    Promise.all([
      apiFetch('/api/users/me').then((r) => r.json()),
      apiFetch('/api/users/me/messages?limit=10').then((r) => r.json()),
    ]).then(([userData, msgData]) => {
      if (userData.user?.profile) {
        setProfile({
          zipCode: userData.user.profile.zipCode ?? '',
          stateCode: userData.user.profile.stateCode ?? '',
          matchedAddress: userData.user.profile.addressLine1 ?? '',
          notificationNewBills: userData.user.profile.notificationNewBills ?? true,
          notificationBillUpdates: userData.user.profile.notificationBillUpdates ?? true,
          notificationEmail: userData.user.profile.notificationEmail ?? true,
        })
      } else {
        setProfile({
          zipCode: '',
          stateCode: '',
          matchedAddress: '',
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
    setLookupError(null)
    setPendingLocation(null)

    try {
      const isZip = /^\d{5}$/.test(lookupInput.trim())
      const body = isZip ? { zipCode: lookupInput.trim() } : { address: lookupInput.trim() }

      const res = await apiFetch('/api/representatives/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json() as {
        location?: { stateCode: string; matchedAddress: string }
        representatives?: unknown[]
        error?: string
      }

      if (!res.ok || data.error) {
        setLookupError('Could not find representatives for that location. Try a full address like "123 Main St, Springfield, IL".')
      } else {
        setPendingLocation({
          matchedAddress: data.location?.matchedAddress ?? lookupInput,
          stateCode: data.location?.stateCode ?? '',
          repCount: data.representatives?.length ?? 0,
        })
      }
    } catch {
      setLookupError('Something went wrong. Please try again.')
    } finally {
      setLookupLoading(false)
    }
  }

  const confirmLocation = () => {
    if (!pendingLocation || !profile) return
    setProfile({
      ...profile,
      stateCode: pendingLocation.stateCode,
      matchedAddress: pendingLocation.matchedAddress,
    })
    setPendingLocation(null)
    setLookupInput('')
  }

  const retryLocation = () => {
    setPendingLocation(null)
    setLookupError(null)
    setLookupInput('')
  }

  const handleSaveNotifications = async () => {
    if (!profile) return
    setSavingProfile(true)

    try {
      await apiFetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const hasLocation = profile?.stateCode

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {/* Account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{session?.user?.name ?? '—'}</span>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{session?.user?.email}</span>
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card id="location">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4" />
            Your location
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Used to find your representatives and personalize your feed.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current saved location */}
          {hasLocation && (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current location
              </p>
              <p className="font-medium text-foreground">
                {profile.matchedAddress
                  ? profile.matchedAddress
                  : [profile.zipCode, profile.stateCode].filter(Boolean).join(', ')}
              </p>
            </div>
          )}

          {/* Pending confirmation */}
          {pendingLocation ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-navy-200 bg-navy-50 px-4 py-3 text-sm dark:border-navy-800 dark:bg-navy-900/20">
                <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-navy-700 dark:text-blue-400">
                  Location found
                </p>
                <p className="font-medium text-navy-900 dark:text-blue-200">
                  {pendingLocation.matchedAddress}
                </p>
                <p className="mt-0.5 text-xs text-navy-600 dark:text-blue-300">
                  {pendingLocation.repCount} representative{pendingLocation.repCount !== 1 ? 's' : ''} found
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={confirmLocation}
                  className="gap-2 bg-navy-900 text-white hover:bg-navy-800"
                >
                  <Check className="h-4 w-4" />
                  Use this location
                </Button>
                <Button
                  variant="outline"
                  onClick={retryLocation}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try different
                </Button>
              </div>
            </div>
          ) : (
            /* Lookup form */
            <div className="space-y-2">
              <form onSubmit={handleLookup} className="flex gap-2">
                <Input
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value)}
                  placeholder="ZIP code or full address…"
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={lookupLoading || !lookupInput.trim()}
                  className="bg-navy-900 text-white hover:bg-navy-800"
                >
                  {lookupLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : hasLocation ? 'Update' : 'Find reps'}
                </Button>
              </form>
              {lookupError && (
                <p className="text-sm text-crimson-600 dark:text-red-400">{lookupError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profile && (
            <div className="space-y-4">
              {(
                [
                  { key: 'notificationNewBills', label: 'New bills from my representatives' },
                  { key: 'notificationBillUpdates', label: 'Bill status changes (passed, signed, etc.)' },
                  { key: 'notificationEmail', label: 'Send alerts by email' },
                ] as { key: keyof UserProfile; label: string }[]
              ).map(({ key, label }, i, arr) => (
                <div key={key}>
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="text-sm text-foreground">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={profile[key] as boolean}
                      onClick={() => setProfile({ ...profile, [key]: !profile[key] })}
                      className={cn(
                        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        profile[key] ? 'bg-navy-900' : 'bg-slate-200 dark:bg-slate-700',
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          profile[key] ? 'translate-x-6' : 'translate-x-1',
                        )}
                      />
                    </button>
                  </label>
                  {i < arr.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
              <div className="pt-2">
                <Button
                  onClick={handleSaveNotifications}
                  disabled={savingProfile}
                  className="bg-navy-900 text-white hover:bg-navy-800"
                >
                  {savingProfile ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : savedProfile ? (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  ) : null}
                  {savedProfile ? 'Saved!' : 'Save preferences'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message history */}
      <Card id="messages">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Recent messages sent
          </CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              You haven&apos;t contacted any representatives yet.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border border-border bg-muted/50 p-4 text-sm"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      To:{' '}
                      <span className="font-medium text-foreground">{msg.representative.fullName}</span>
                      {msg.representative.stateCode && ` (${msg.representative.stateCode})`}
                    </span>
                    <span>{new Date(msg.sentAt).toLocaleDateString()}</span>
                  </div>
                  {msg.bill && (
                    <p className="mb-1 text-xs text-muted-foreground">
                      Re: {msg.bill.billNumber ? `${msg.bill.billNumber} — ` : ''}{msg.bill.title}
                    </p>
                  )}
                  {msg.subject && (
                    <p className="font-medium text-foreground">{msg.subject}</p>
                  )}
                  <p className="line-clamp-2 text-muted-foreground">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
