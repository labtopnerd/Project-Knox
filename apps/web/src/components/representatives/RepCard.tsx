import Image from 'next/image'
import Link from 'next/link'
import { Phone, Mail, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { Representative } from '@project-knox/types'

const PARTY_COLORS: Record<string, string> = {
  Democrat:    'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  Republican:  'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  Independent: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  Green:       'bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  Libertarian: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
}

const CHAMBER_LABELS: Record<string, string> = {
  senate:       'U.S. Senate',
  house:        'U.S. House',
  state_senate: 'State Senate',
  state_house:  'State House',
  local:        'Local Government',
}

interface RepCardProps {
  rep: Representative
  compact?: boolean
}

export function RepCard({ rep, compact = false }: RepCardProps) {
  const partyClass = PARTY_COLORS[rep.party ?? ''] ?? 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  const chamberLabel = CHAMBER_LABELS[rep.chamber] ?? rep.chamber
  const initials = rep.fullName.charAt(0).toUpperCase()

  return (
    <Card className={cn(
      'border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800',
      compact ? 'p-0' : 'p-0',
    )}>
      <CardContent className={cn('flex gap-4', compact ? 'p-4' : 'p-5')}>
        {/* Avatar */}
        <div className="shrink-0">
          <Avatar className={compact ? 'h-12 w-12' : 'h-16 w-16'}>
            {rep.photoUrl && (
              <AvatarImage src={rep.photoUrl} alt={rep.fullName} />
            )}
            <AvatarFallback className="bg-navy-100 text-navy-900 font-semibold dark:bg-navy-900 dark:text-blue-200">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Link
              href={`/representatives/${rep.id}`}
              className="font-semibold text-slate-900 hover:text-navy-900 dark:text-white dark:hover:text-blue-400"
            >
              {rep.title ? `${rep.title} ` : ''}{rep.fullName}
            </Link>
            {rep.party && (
              <Badge variant="outline" className={cn('text-xs', partyClass)}>
                {rep.party.charAt(0)}
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {chamberLabel}
            {rep.stateCode && ` — ${rep.stateCode}`}
            {rep.district && `, District ${rep.district}`}
          </p>

          {!compact && (
            <div className="mt-3 flex flex-wrap gap-3">
              {rep.phone && (
                <Button variant="ghost" size="sm" asChild className="h-auto gap-1.5 px-0 text-slate-600 hover:text-navy-900 dark:text-slate-400 dark:hover:text-blue-400">
                  <a href={`tel:${rep.phone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    {rep.phone}
                  </a>
                </Button>
              )}
              {rep.email && (
                <Button variant="ghost" size="sm" asChild className="h-auto gap-1.5 px-0 text-slate-600 hover:text-navy-900 dark:text-slate-400 dark:hover:text-blue-400">
                  <a href={`mailto:${rep.email}`}>
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </a>
                </Button>
              )}
              {rep.contactFormUrl && (
                <Button variant="ghost" size="sm" asChild className="h-auto gap-1.5 px-0 text-slate-600 hover:text-navy-900 dark:text-slate-400 dark:hover:text-blue-400">
                  <a href={rep.contactFormUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Contact form
                  </a>
                </Button>
              )}
              {rep.websiteUrl && (
                <Button variant="ghost" size="sm" asChild className="h-auto gap-1.5 px-0 text-slate-600 hover:text-navy-900 dark:text-slate-400 dark:hover:text-blue-400">
                  <a href={rep.websiteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Website
                  </a>
                </Button>
              )}
            </div>
          )}

          {!compact && (
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" asChild className="border-slate-200 dark:border-slate-700">
                <Link href={`/representatives/${rep.id}`}>View profile</Link>
              </Button>
              <Button size="sm" asChild className="bg-navy-900 text-white hover:bg-navy-800">
                <Link href={`/contact/${rep.id}`}>Contact</Link>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
