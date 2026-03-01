import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BillFeed } from '@/components/bills/BillFeed'
import { BillFilters } from '@/components/bills/BillFilters'
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'My Feed' }

export default async function FeedPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const profile = await prisma.userProfile.findUnique({
    where: { id: session.user.id },
    select: { stateCode: true, fedDistrict: true },
  })

  const hasLocation = !!profile?.stateCode

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">My Feed</h1>
        <p className="mt-1 text-muted-foreground">
          Bills from your representatives in Congress and your state legislature
        </p>
      </div>

      {!hasLocation && <OnboardingBanner />}

      <BillFilters />
      <BillFeed forUser={hasLocation} />
    </div>
  )
}
