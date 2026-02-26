import Image from 'next/image'
import Link from 'next/link'
import { Phone, Mail, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Representative } from '@project-knox/types'

const PARTY_COLORS: Record<string, string> = {
  Democrat: 'bg-blue-100 text-blue-800',
  Republican: 'bg-red-100 text-red-800',
  Independent: 'bg-purple-100 text-purple-800',
  Green: 'bg-green-100 text-green-800',
  Libertarian: 'bg-yellow-100 text-yellow-800',
}

const CHAMBER_LABELS: Record<string, string> = {
  senate: 'U.S. Senate',
  house: 'U.S. House',
  state_senate: 'State Senate',
  state_house: 'State House',
  local: 'Local Government',
}

interface RepCardProps {
  rep: Representative
  compact?: boolean
}

export function RepCard({ rep, compact = false }: RepCardProps) {
  const partyClass = PARTY_COLORS[rep.party ?? ''] ?? 'bg-gray-100 text-gray-700'
  const chamberLabel = CHAMBER_LABELS[rep.chamber] ?? rep.chamber

  return (
    <article
      className={cn(
        'rounded-xl border border-gray-100 bg-white shadow-sm',
        compact ? 'p-4' : 'p-5',
      )}
    >
      <div className="flex gap-4">
        {/* Photo */}
        <div className="shrink-0">
          {rep.photoUrl ? (
            <Image
              src={rep.photoUrl}
              alt={rep.fullName}
              width={compact ? 48 : 64}
              height={compact ? 48 : 64}
              className="rounded-full object-cover"
            />
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-full bg-gray-100 text-gray-400',
                compact ? 'h-12 w-12 text-lg' : 'h-16 w-16 text-2xl',
              )}
            >
              {rep.fullName.charAt(0)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Link
              href={`/representatives/${rep.id}`}
              className="font-semibold text-gray-900 hover:text-primary-600"
            >
              {rep.title ? `${rep.title} ` : ''}{rep.fullName}
            </Link>
            {rep.party && (
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', partyClass)}>
                {rep.party.charAt(0)}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {chamberLabel}
            {rep.stateCode && ` — ${rep.stateCode}`}
            {rep.district && `, District ${rep.district}`}
          </p>

          {!compact && (
            <div className="mt-3 flex flex-wrap gap-3">
              {rep.phone && (
                <a
                  href={`tel:${rep.phone}`}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {rep.phone}
                </a>
              )}
              {rep.email && (
                <a
                  href={`mailto:${rep.email}`}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </a>
              )}
              {rep.contactFormUrl && (
                <a
                  href={rep.contactFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Contact form
                </a>
              )}
              {rep.websiteUrl && (
                <a
                  href={rep.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-primary-600"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mt-4 flex gap-2">
          <Link
            href={`/representatives/${rep.id}`}
            className="rounded-lg bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            View profile
          </Link>
          <Link
            href={`/contact/${rep.id}`}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Contact
          </Link>
        </div>
      )}
    </article>
  )
}
