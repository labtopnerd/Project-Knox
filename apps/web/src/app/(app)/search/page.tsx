import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { BillFeed } from '@/components/bills/BillFeed'
import { BillFilters } from '@/components/bills/BillFilters'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Search Bills' }

export default async function SearchPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Search Bills</h1>
        <p className="mt-1 text-gray-500">
          Search all federal and state legislation by keyword, topic, or status
        </p>
      </div>

      <BillFilters />
      <BillFeed />
    </div>
  )
}
