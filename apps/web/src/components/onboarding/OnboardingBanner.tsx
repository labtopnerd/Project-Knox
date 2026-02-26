'use client'

import Link from 'next/link'
import { MapPin } from 'lucide-react'

export function OnboardingBanner() {
  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-primary-100 bg-primary-50 p-4">
      <div className="rounded-full bg-primary-100 p-2">
        <MapPin className="h-5 w-5 text-primary-600" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-primary-900">Set your location to personalize your feed</p>
        <p className="text-sm text-primary-600">
          We'll show you bills from your specific representatives.
        </p>
      </div>
      <Link
        href="/settings"
        className="shrink-0 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
      >
        Set Location
      </Link>
    </div>
  )
}
