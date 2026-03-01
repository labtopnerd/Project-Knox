'use client'

import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function OnboardingBanner() {
  return (
    <div className="relative mb-6 flex items-center gap-4 overflow-hidden rounded-xl bg-navy-900 p-4 text-white">
      {/* Decorative stripes */}
      <svg
        aria-hidden="true"
        className="absolute right-0 top-0 h-full w-32 opacity-10"
        viewBox="0 0 128 64"
        preserveAspectRatio="none"
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <rect key={i} x={i * 20 - 10} y="0" width="10" height="64" fill="white" />
        ))}
      </svg>

      <div className="rounded-full bg-white/20 p-2">
        <MapPin className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-white">Set your location to personalize your feed</p>
        <p className="text-sm text-blue-200">
          We&apos;ll show you bills from your specific representatives.
        </p>
      </div>
      <Button
        asChild
        variant="outline"
        size="sm"
        className="shrink-0 border-white/60 bg-transparent text-white hover:bg-white/10 hover:text-white dark:border-white/60 dark:hover:bg-white/10"
      >
        <Link href="/settings">Set Location</Link>
      </Button>
    </div>
  )
}
