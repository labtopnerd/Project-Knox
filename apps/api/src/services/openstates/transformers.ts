/**
 * Transform OpenStates API responses into Project Knox database schema format.
 */

import type { Prisma } from '@prisma/client'
import type { OpenStatesBill, OpenStatesPerson } from './client'

function mapOpenStatesChamber(classification: string, isFederal: boolean): string {
  const c = classification.toLowerCase()
  if (c.includes('upper')) return isFederal ? 'senate' : 'state_senate'
  if (c.includes('lower')) return isFederal ? 'house' : 'state_house'
  return isFederal ? 'house' : 'state_house'
}

function isFederalJurisdiction(jurisdictionId: string): boolean {
  // Federal: "ocd-jurisdiction/country:us/government"
  // State:   "ocd-jurisdiction/country:us/state:ca/government"
  return !jurisdictionId.includes('/state:')
}

function isLocalJurisdiction(jurisdictionId: string): boolean {
  // Local: "ocd-jurisdiction/country:us/state:mn/place:duluth/government"
  //        "ocd-jurisdiction/country:us/state:mn/county:hennepin/government"
  return (
    jurisdictionId.includes('/place:') ||
    jurisdictionId.includes('/county:') ||
    jurisdictionId.includes('/district:') ||
    jurisdictionId.includes('/school_district:')
  )
}

function mapOpenStatesStatus(bill: OpenStatesBill): string {
  if (!bill.actions || bill.actions.length === 0) return 'introduced'

  const actionTypes = bill.actions.flatMap((a) => a.classification)
  if (actionTypes.includes('executive-signature')) return 'signed'
  if (actionTypes.includes('executive-veto')) return 'vetoed'
  if (actionTypes.includes('passed')) return 'passed'
  if (actionTypes.includes('committee-passage')) return 'committee'
  if (actionTypes.includes('introduction')) return 'introduced'

  const lastDesc = bill.latest_action_description?.toLowerCase() ?? ''
  if (lastDesc.includes('signed')) return 'signed'
  if (lastDesc.includes('passed')) return 'passed'
  if (lastDesc.includes('committee')) return 'committee'
  return 'introduced'
}

function extractStateCode(jurisdictionId: string): string {
  // OpenStates jurisdiction IDs look like "ocd-jurisdiction/country:us/state:ca/government"
  const match = /state:([a-z]{2})/.exec(jurisdictionId)
  return match?.[1]?.toUpperCase() ?? ''
}

/**
 * Transform an OpenStates bill into a Prisma-compatible Bill create input.
 */
export function transformOpenStatesBill(
  bill: OpenStatesBill,
): Omit<Prisma.BillCreateInput, 'sponsor'> & { sponsorPersonId?: string } {
  const stateCode = extractStateCode(bill.from_organization.id)
  const chamber = mapOpenStatesChamber(bill.from_organization.classification, false)
  const status = mapOpenStatesStatus(bill)

  const primarySponsor = bill.sponsorships?.find((s) => s.primary)
  const summary = bill.abstracts?.[0]?.abstract ?? null

  const tags = bill.subject.map((s) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  )

  return {
    externalId: `openstates:${bill.id}`,
    source: 'openstates',
    congressNumber: null,
    billType: bill.classification[0] ?? 'bill',
    billNumber: bill.identifier,
    title: bill.title,
    summary,
    status,
    chamber,
    level: 'state',
    stateCode: stateCode || null,
    introducedDate: bill.first_action_date ? new Date(bill.first_action_date) : null,
    lastActionDate: bill.latest_action_date ? new Date(bill.latest_action_date) : null,
    lastActionText: bill.latest_action_description,
    issueTags: tags,
    url: bill.openstates_url,
    sponsorPersonId: primarySponsor?.person_id ?? undefined,
    lastSyncedAt: new Date(),
    rawData: bill as unknown as Prisma.InputJsonValue,
  }
}

/**
 * Transform an OpenStates person into a Prisma-compatible Representative create input.
 */
export function transformOpenStatesPerson(
  person: OpenStatesPerson,
): Prisma.RepresentativeCreateInput {
  const role = person.current_role
  const isFederal = isFederalJurisdiction(person.jurisdiction.id)
  const isLocal = !isFederal && isLocalJurisdiction(person.jurisdiction.id)
  const level = isFederal ? 'federal' : isLocal ? 'local' : 'state'
  const stateCode = isFederal ? null : extractStateCode(person.jurisdiction.id)
  const chamber = isLocal
    ? 'local'
    : role
      ? mapOpenStatesChamber(role.org_classification, isFederal)
      : 'state_house'
  const websiteLink = person.links.find((l) => l.note?.toLowerCase().includes('website'))
  const twitterLink = person.links.find((l) => l.note?.toLowerCase().includes('twitter'))

  const partyNormalized = normalizeParty(person.party)

  return {
    externalId: `openstates:${person.id}`,
    source: 'openstates',
    fullName: person.name,
    party: partyNormalized,
    chamber,
    level,
    stateCode: stateCode || null,
    district: role?.district ?? null,
    title: role?.title ?? null,
    photoUrl: person.image || null,
    websiteUrl: websiteLink?.url ?? null,
    email: person.email ?? null,
    phone: null, // OpenStates does not reliably provide phone numbers
    contactFormUrl: websiteLink?.url ? `${websiteLink.url.replace(/\/$/, '')}/contact` : null,
    twitterHandle: twitterLink?.url
      ? twitterLink.url.replace(/.*twitter\.com\//, '').replace(/\?.*/, '')
      : null,
    isActive: !!role,
    rawData: person as unknown as Prisma.InputJsonValue,
    lastSyncedAt: new Date(),
  }
}

function normalizeParty(party: string): string {
  const p = party.toLowerCase()
  if (p.includes('democrat')) return 'Democrat'
  if (p.includes('republican')) return 'Republican'
  if (p.includes('independent')) return 'Independent'
  if (p.includes('green')) return 'Green'
  if (p.includes('libertarian')) return 'Libertarian'
  return party
}
