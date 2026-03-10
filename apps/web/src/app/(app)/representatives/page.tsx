import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { RepCard } from '@/components/representatives/RepCard'
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner'
import type { Metadata } from 'next'
import type { Representative } from '@project-knox/types'

export const metadata: Metadata = { title: 'My Representatives' }
export const dynamic = 'force-dynamic'

export default async function RepresentativesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userReps = await prisma.userRepresentative.findMany({
    where: { userId: session.user.id },
    include: { representative: true },
    orderBy: [
      { representative: { level: 'asc' } },
      { representative: { chamber: 'asc' } },
    ],
  })

  const hasLocation = userReps.length > 0

  const LEVEL_TO_SECTION: Record<string, string> = {
    federal: 'Federal',
    state: 'State',
    local: 'Local',
  }
  const SECTION_ORDER = ['Federal', 'State', 'Local']

  const grouped: Record<string, typeof userReps> = {}
  for (const ur of userReps) {
    const key = LEVEL_TO_SECTION[ur.representative.level] ?? 'Local'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(ur)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Representatives</h1>
        <p className="mt-1 text-gray-500">
          Your elected officials at the federal, state, and local levels
        </p>
      </div>

      {!hasLocation && <OnboardingBanner />}

      {hasLocation && (
        <div className="space-y-8">
          {SECTION_ORDER.filter((k) => grouped[k]).map((groupName) => (
            <section key={groupName}>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
                {groupName}
              </h2>
              <div className="space-y-4">
                {(grouped[groupName] ?? []).map((ur) => (
                  <RepCard
                    key={ur.representativeId}
                    rep={ur.representative as Representative}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
