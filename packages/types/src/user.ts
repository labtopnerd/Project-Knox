export interface UserProfile {
  id: string
  zipCode: string | null
  addressLine1: string | null
  city: string | null
  stateCode: string | null
  latitude: number | null
  longitude: number | null
  fedDistrict: string | null   // e.g. "CA-12"
  stateDistrict: string | null
  notificationNewBills: boolean
  notificationBillUpdates: boolean
  notificationEmail: boolean
  notificationPush: boolean
}

export interface UserWithProfile {
  id: string
  name: string | null
  email: string
  image: string | null
  profile: UserProfile | null
}

export interface LocationSetupInput {
  zipCode?: string
  addressLine1?: string
  city?: string
  stateCode?: string
}

export interface LocationSetupResult {
  profile: UserProfile
  representativesFound: number
}
