export type RepLevel = 'federal' | 'state' | 'local'
export type RepChamber = 'senate' | 'house' | 'state_senate' | 'state_house' | 'local'
export type Party = 'Democrat' | 'Republican' | 'Independent' | 'Green' | 'Libertarian' | 'Other'

export interface Representative {
  id: string
  externalId: string
  source: string
  fullName: string
  party: Party | string | null
  chamber: RepChamber
  level: RepLevel
  stateCode: string
  district: string | null
  title: string | null
  photoUrl: string | null
  websiteUrl: string | null
  email: string | null
  phone: string | null
  contactFormUrl: string | null
  twitterHandle: string | null
  isActive: boolean
  termStart: string | null
  termEnd: string | null
}

export interface RepresentativeWithContact extends Representative {
  contactInstructions?: string
  talkingPoints?: string[]
}

export interface RepLookupResult {
  federal: {
    senators: Representative[]
    representative: Representative | null
  }
  state: {
    senators: Representative[]
    representatives: Representative[]
  }
  local?: Representative[]
}
