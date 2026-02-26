/**
 * Transform Congress.gov API responses into Project Knox database schema format.
 */

import type { Prisma } from '@prisma/client'
import type { CongressBill, CongressBillDetail, CongressMemberDetail } from './client'

const BILL_TYPE_MAP: Record<string, string> = {
  hr: 'H.R.',
  s: 'S.',
  hjres: 'H.J.Res.',
  sjres: 'S.J.Res.',
  hconres: 'H.Con.Res.',
  sconres: 'S.Con.Res.',
  hres: 'H.Res.',
  sres: 'S.Res.',
}

function formatBillNumber(type: string, number: string): string {
  const prefix = BILL_TYPE_MAP[type.toLowerCase()] ?? type.toUpperCase()
  return `${prefix} ${number}`
}

function mapBillStatus(latestActionText: string): string {
  const text = latestActionText.toLowerCase()
  if (text.includes('signed by president') || text.includes('became public law')) return 'signed'
  if (text.includes('vetoed')) return 'vetoed'
  if (text.includes('passed house') && text.includes('passed senate')) return 'passed'
  if (text.includes('passed house') || text.includes('passed senate')) return 'passed_chamber'
  if (text.includes('referred to') || text.includes('committee')) return 'committee'
  if (text.includes('floor') || text.includes('scheduled') || text.includes('vote')) return 'floor'
  if (text.includes('introduced') || text.includes('submitted')) return 'introduced'
  return 'introduced'
}

function mapChamber(originChamber: string): string {
  return originChamber.toLowerCase() === 'house' ? 'house' : 'senate'
}

/**
 * Transform a Congress.gov bill list item into a Prisma-compatible Bill create input.
 */
export function transformCongressBill(
  bill: CongressBill,
): Omit<Prisma.BillCreateInput, 'sponsor'> & { sponsorExternalId?: string } {
  const externalId = `congress:${bill.congress}:${bill.type.toLowerCase()}:${bill.number}`
  const billNumber = formatBillNumber(bill.type, bill.number)
  const status = mapBillStatus(bill.latestAction.text)

  return {
    externalId,
    source: 'congress',
    congressNumber: bill.congress,
    billType: bill.type.toLowerCase(),
    billNumber,
    title: bill.title,
    status,
    chamber: mapChamber(bill.originChamber),
    level: 'federal',
    stateCode: null,
    introducedDate: bill.introducedDate ? new Date(bill.introducedDate) : null,
    lastActionDate: bill.latestAction.actionDate ? new Date(bill.latestAction.actionDate) : null,
    lastActionText: bill.latestAction.text,
    url: bill.url,
    issueTags: [],
    lastSyncedAt: new Date(),
    rawData: bill as unknown as Prisma.InputJsonValue,
  }
}

/**
 * Transform a Congress.gov bill detail into enriched Bill data.
 */
export function transformCongressBillDetail(
  detail: CongressBillDetail,
): Partial<Omit<Prisma.BillCreateInput, 'sponsor'>> & { sponsorExternalId?: string } {
  const tags: string[] = []
  if (detail.policyArea?.name) {
    tags.push(slugify(detail.policyArea.name))
  }

  const sponsorExternalId =
    detail.sponsors && detail.sponsors.length > 0
      ? `congress:${detail.sponsors[0]!.bioguideId}`
      : undefined

  return {
    issueTags: tags,
    sponsorExternalId,
    rawData: detail as unknown as Prisma.InputJsonValue,
  }
}

/**
 * Transform a Congress.gov member detail into a Representative create input.
 */
export function transformCongressMember(
  member: CongressMemberDetail,
): Prisma.RepresentativeCreateInput {
  const latestTerm = member.terms.item[member.terms.item.length - 1]
  const chamber = latestTerm?.chamber?.toLowerCase().includes('house') ? 'house' : 'senate'

  return {
    externalId: `congress:${member.bioguideId}`,
    source: 'congress',
    fullName: member.name,
    party: member.partyHistory?.[member.partyHistory.length - 1]?.partyName ?? member.party,
    chamber,
    level: 'federal',
    stateCode: member.state,
    district: member.district ? String(member.district) : null,
    title: chamber === 'senate' ? 'Senator' : 'Representative',
    photoUrl: member.depiction?.imageUrl ?? null,
    websiteUrl: member.officialWebsiteUrl ?? null,
    phone: member.addressInformation?.phoneNumber ?? null,
    officeAddress: member.addressInformation?.officeAddress ?? null,
    // Congress.gov does not expose individual member emails — use contact form
    contactFormUrl: member.officialWebsiteUrl
      ? `${member.officialWebsiteUrl.replace(/\/$/, '')}/contact`
      : null,
    isActive: member.currentMember,
    termStart: latestTerm?.startYear ? new Date(`${latestTerm.startYear}-01-03`) : null,
    termEnd: latestTerm?.endYear ? new Date(`${latestTerm.endYear}-01-03`) : null,
    rawData: member as unknown as Prisma.InputJsonValue,
    lastSyncedAt: new Date(),
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
