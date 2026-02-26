'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VotePosition } from '@project-knox/types'

interface VoteButtonsProps {
  billId: string
  currentVote: VotePosition | null
  aggregates?: {
    supportCount: number
    opposeCount: number
    neutralCount: number
    totalCount: number
  } | null
  disabled?: boolean
}

const VOTE_OPTIONS: {
  position: VotePosition
  label: string
  icon: typeof ThumbsUp
  activeClass: string
  hoverClass: string
}[] = [
  {
    position: 'support',
    label: 'Support',
    icon: ThumbsUp,
    activeClass: 'bg-support text-white border-support',
    hoverClass: 'hover:border-support hover:text-support',
  },
  {
    position: 'neutral',
    label: 'Neutral',
    icon: Minus,
    activeClass: 'bg-neutral-500 text-white border-neutral-500',
    hoverClass: 'hover:border-gray-400 hover:text-gray-600',
  },
  {
    position: 'oppose',
    label: 'Oppose',
    icon: ThumbsDown,
    activeClass: 'bg-oppose text-white border-oppose',
    hoverClass: 'hover:border-oppose hover:text-oppose',
  },
]

async function submitVote(billId: string, position: VotePosition): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
  const response = await fetch(`${apiUrl}/api/bills/${billId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ position }),
  })
  if (!response.ok) throw new Error('Failed to submit vote')
}

export function VoteButtons({ billId, currentVote, disabled }: VoteButtonsProps) {
  const [optimisticVote, setOptimisticVote] = useState<VotePosition | null>(currentVote)
  const queryClient = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationFn: (position: VotePosition) => submitVote(billId, position),
    onMutate: (position) => {
      // Optimistic update
      setOptimisticVote(position)
    },
    onError: () => {
      // Rollback on error
      setOptimisticVote(currentVote)
    },
    onSuccess: () => {
      // Invalidate to refetch fresh aggregates
      void queryClient.invalidateQueries({ queryKey: ['bills'] })
      void queryClient.invalidateQueries({ queryKey: ['bill', billId] })
    },
  })

  const handleVote = (position: VotePosition) => {
    if (disabled || isPending) return
    mutate(position)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 mr-1">Your vote:</span>
      {VOTE_OPTIONS.map(({ position, label, icon: Icon, activeClass, hoverClass }) => {
        const isActive = optimisticVote === position
        return (
          <button
            key={position}
            onClick={() => handleVote(position)}
            disabled={disabled || isPending}
            aria-label={`Vote ${label}`}
            aria-pressed={isActive}
            className={cn(
              'flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-all',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isActive ? activeClass : cn('border-gray-200 text-gray-600 bg-white', hoverClass),
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
