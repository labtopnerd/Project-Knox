'use client'

import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

interface BookmarkButtonProps {
  billId: string
  initialBookmarked: boolean
}

async function toggleBookmark(billId: string, isBookmarked: boolean): Promise<void> {
  const response = await apiFetch(`/api/bills/${billId}/bookmark`, {
    method: isBookmarked ? 'DELETE' : 'POST',
  })
  if (!response.ok) throw new Error('Failed to update bookmark')
}

export function BookmarkButton({ billId, initialBookmarked }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const [isPending, setIsPending] = useState(false)

  const handleClick = async () => {
    if (isPending) return
    setIsPending(true)
    const prev = bookmarked
    setBookmarked(!prev)
    try {
      await toggleBookmark(billId, prev)
    } catch {
      setBookmarked(prev)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isPending}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this bill'}
      aria-pressed={bookmarked}
      className={cn(
        bookmarked
          ? 'text-navy-900 dark:text-blue-400'
          : 'text-slate-400 hover:text-navy-900 dark:hover:text-blue-400',
      )}
    >
      <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
    </Button>
  )
}
