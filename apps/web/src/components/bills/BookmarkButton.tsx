'use client'

import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BookmarkButtonProps {
  billId: string
  initialBookmarked: boolean
}

async function toggleBookmark(billId: string, isBookmarked: boolean): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const response = await fetch(`${apiUrl}/api/bills/${billId}/bookmark`, {
    method: isBookmarked ? 'DELETE' : 'POST',
    credentials: 'include',
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
    <button
      onClick={handleClick}
      disabled={isPending}
      aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this bill'}
      aria-pressed={bookmarked}
      className={cn(
        'flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        bookmarked
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-gray-200 bg-white text-gray-600 hover:border-primary-400 hover:text-primary-600',
      )}
    >
      <Bookmark className={cn('h-4 w-4', bookmarked && 'fill-current')} />
      {bookmarked ? 'Saved' : 'Save'}
    </button>
  )
}
