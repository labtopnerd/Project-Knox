import type { VotePosition } from './bill'

export interface UserVote {
  id: string
  userId: string
  billId: string
  vote: VotePosition
  createdAt: string
  updatedAt: string
}

export interface VoteInput {
  billId: string
  position: VotePosition
}

export interface VoteResponse {
  vote: UserVote
  aggregates: {
    supportCount: number
    opposeCount: number
    neutralCount: number
    totalCount: number
  }
}

export interface SentMessage {
  id: string
  userId: string
  representativeId: string
  billId: string | null
  channel: 'email' | 'phone_note' | 'form'
  subject: string | null
  body: string
  sentAt: string
}

export interface ContactRepInput {
  representativeId: string
  billId?: string
  subject: string
  body: string
  channel: 'email' | 'form'
}
