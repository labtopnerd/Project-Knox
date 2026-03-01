'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock } from 'lucide-react'

interface TimelineAction {
  date: string
  text: string
  type?: string | null
  actionCode?: string | null
}

interface Props {
  actions: TimelineAction[]
}

const PREVIEW_COUNT = 8

export function BillTimeline({ actions }: Props) {
  const [showAll, setShowAll] = useState(false)

  if (!actions.length) return null

  // Sort newest first
  const sorted = [...actions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const visible = showAll ? sorted : sorted.slice(0, PREVIEW_COUNT)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Legislative timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-0 border-l border-border ml-2">
          {visible.map((action, i) => {
            const isLatest = i === 0
            const date = new Date(action.date)
            const formatted = date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })

            return (
              <li key={i} className="relative pb-5 pl-6 last:pb-0">
                {/* Dot */}
                <span
                  className={`absolute -left-[5px] top-[3px] h-2.5 w-2.5 rounded-full border-2 border-background ${
                    isLatest ? 'bg-navy-900 dark:bg-blue-400' : 'bg-muted-foreground/40'
                  }`}
                />
                <time className="mb-0.5 block text-xs text-muted-foreground">{formatted}</time>
                <p className={`text-sm leading-snug ${isLatest ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {action.text}
                </p>
              </li>
            )
          })}
        </ol>

        {sorted.length > PREVIEW_COUNT && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full text-xs"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Show less' : `Show full history (${sorted.length} actions)`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
