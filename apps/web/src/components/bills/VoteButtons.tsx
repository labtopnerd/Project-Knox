'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { VotePosition } from '@project-knox/types'
import { apiFetch } from '@/lib/api-client'

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
  inactiveClass: string
}[] = [
  {
    position: 'support',
    label: 'Support',
    icon: ThumbsUp,
    activeClass: 'border-support bg-support text-white hover:bg-support/90',
    inactiveClass: 'border-support/40 text-support hover:border-support hover:bg-support/10',
  },
  {
    position: 'neutral',
    label: 'Neutral',
    icon: Minus,
    activeClass: 'border-slate-500 bg-slate-500 text-white hover:bg-slate-500/90',
    inactiveClass: 'border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800',
  },
  {
    position: 'oppose',
    label: 'Oppose',
    icon: ThumbsDown,
    activeClass: 'border-crimson-600 bg-crimson-600 text-white hover:bg-crimson-700',
    inactiveClass: 'border-crimson-300 text-crimson-600 hover:border-crimson-600 hover:bg-crimson-50 dark:border-crimson-800 dark:text-crimson-400 dark:hover:bg-slate-800',
  },
]

async function submitVote(billId: string, position: VotePosition): Promise<void> {
  const response = await apiFetch(`/api/bills/${billId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      setOptimisticVote(position)
    },
    onError: () => {
      setOptimisticVote(currentVote)
    },
    onSuccess: () => {
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
      <span className="mr-1 text-sm text-slate-500 dark:text-slate-400">Your vote:</span>
      {VOTE_OPTIONS.map(({ position, label, icon: Icon, activeClass, inactiveClass }) => {
        const isActive = optimisticVote === position
        return (
          <Button
            key={position}
            variant="outline"
            size="sm"
            onClick={() => handleVote(position)}
            disabled={disabled || isPending}
            aria-label={`Vote ${label}`}
            aria-pressed={isActive}
            className={cn(
              'rounded-full border-2 font-medium transition-all',
              isActive ? activeClass : inactiveClass,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        )
      })}
    </div>
  )
}
