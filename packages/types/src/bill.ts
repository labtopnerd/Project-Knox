export type BillSource = 'congress' | 'openstates' | 'legiscan'
export type BillChamber = 'house' | 'senate' | 'state_house' | 'state_senate'
export type BillLevel = 'federal' | 'state'
export type BillStatus =
  | 'introduced'
  | 'committee'
  | 'floor'
  | 'passed_chamber'
  | 'passed'
  | 'failed'
  | 'signed'
  | 'vetoed'
  | 'unknown'

export type VotePosition = 'support' | 'oppose' | 'neutral'

export interface Bill {
  id: string
  externalId: string
  source: BillSource
  billNumber: string | null
  title: string
  shortTitle: string | null
  summary: string | null
  status: BillStatus
  chamber: BillChamber | null
  level: BillLevel
  stateCode: string | null
  introducedDate: string | null
  lastActionDate: string | null
  lastActionText: string | null
  sponsorId: string | null
  sponsorName: string | null
  issueTags: string[]
  url: string | null
  syncedAt: string
  createdAt: string
}

export interface BillWithUserVote extends Bill {
  userVote: VotePosition | null
  aggregates: BillVoteAggregate | null
}

export interface BillVoteAggregate {
  billId: string
  supportCount: number
  opposeCount: number
  neutralCount: number
  totalCount: number
  supportPercent: number
  opposePercent: number
  neutralPercent: number
}

export interface BillFilters {
  level?: BillLevel | 'all'
  stateCode?: string
  chamber?: BillChamber | 'all'
  status?: BillStatus | 'all'
  tags?: string[]
  repId?: string
  search?: string
  forUser?: boolean
  page?: number
  limit?: number
}

export interface BillListResponse {
  bills: BillWithUserVote[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}
