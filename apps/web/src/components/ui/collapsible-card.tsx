'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown } from 'lucide-react'

interface Props {
  title: string
  description?: string
  children: React.ReactNode
  defaultOpen?: boolean
  storageKey?: string
}

export function CollapsibleCard({ title, description, children, defaultOpen = false, storageKey }: Props) {
  const [open, setOpen] = useState(() => {
    if (!storageKey) return defaultOpen
    try {
      const stored = localStorage.getItem(`collapsible:${storageKey}`)
      if (stored !== null) return stored === 'true'
    } catch {}
    return defaultOpen
  })

  function toggle() {
    const next = !open
    setOpen(next)
    if (storageKey) {
      try { localStorage.setItem(`collapsible:${storageKey}`, String(next)) } catch {}
    }
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-3"
        onClick={toggle}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  )
}
