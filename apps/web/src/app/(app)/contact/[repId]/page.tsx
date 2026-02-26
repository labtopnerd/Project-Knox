import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ContactForm } from '@/components/contact/ContactForm'
import { ChevronLeft } from 'lucide-react'
import type { Representative } from '@project-knox/types'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

type Params = { repId: string }
type SearchParams = { billId?: string }

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const rep = await prisma.representative.findUnique({
    where: { id: params.repId },
    select: { fullName: true },
  })
  return { title: rep ? `Contact ${rep.fullName}` : 'Contact Representative' }
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [rep, bill] = await Promise.all([
    prisma.representative.findUnique({ where: { id: params.repId } }),
    searchParams.billId
      ? prisma.bill.findUnique({
          where: { id: searchParams.billId },
          select: { id: true, title: true, billNumber: true },
        })
      : null,
  ])

  if (!rep) notFound()

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/representatives/${rep.id}`}
        className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {rep.fullName}
      </Link>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          Contact {rep.title ?? ''} {rep.fullName}
        </h1>
        {bill && (
          <p className="mb-1 text-sm text-gray-500">
            Regarding:{' '}
            <Link href={`/bills/${bill.id}`} className="font-medium text-primary-600 hover:underline">
              {bill.billNumber ? `${bill.billNumber} — ` : ''}{bill.title}
            </Link>
          </p>
        )}
        <p className="mb-6 text-sm text-gray-400">
          Write a message, use a quick template, or call directly.
        </p>

        <ContactForm
          rep={rep as unknown as Representative}
          billId={bill?.id}
          billTitle={bill?.title}
        />
      </div>

      {/* Sent message history (teaser) */}
      <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4 text-center text-sm text-gray-400">
        View your full message history in{' '}
        <Link href="/settings#messages" className="font-medium text-primary-600 hover:underline">
          Settings → Messages
        </Link>
      </div>
    </div>
  )
}
