/**
 * Transform LegiScan API responses into Project Knox database schema format.
 */

import type { Prisma } from '@prisma/client'
import type { LegiScanBillDetail, LegiScanPerson } from './client'

// ─── Bill number parsing ───────────────────────────────────────────────────────

/**
 * Maps LegiScan bill_number to our existing congress:N:type:number externalId format.
 *
 * "HR1234"   → { type: "hr",      number: "1234" }
 * "SB456"    → { type: "s",       number: "456" }
 * "HJR12"    → { type: "hjres",   number: "12" }
 * "SJR12"    → { type: "sjres",   number: "12" }
 * "HCONRES3" → { type: "hconres", number: "3" }
 * "SCONRES3" → { type: "sconres", number: "3" }
 * "HRES12"   → { type: "hres",    number: "12" }
 * "SRES12"   → { type: "sres",    number: "12" }
 */
export function parseBillNumber(billNumber: string): { type: string; number: string } | null {
  const s = billNumber.trim().toUpperCase()

  // Order matters: check longer prefixes first.
  // LegiScan US Congress formats (verified against actual API data):
  //   HB=House Bill(H.R.), HR=H.Res., HJR=H.J.Res., HCR=H.Con.Res.
  //   SB=Senate Bill(S.), SR=S.Res., SJR=S.J.Res., SCR=S.Con.Res.
  const patterns: [RegExp, string][] = [
    [/^HJR(\d+)$/, 'hjres'],
    [/^SJR(\d+)$/, 'sjres'],
    [/^HCR(\d+)$/, 'hconres'],
    [/^SCR(\d+)$/, 'sconres'],
    [/^HR(\d+)$/, 'hres'],
    [/^SR(\d+)$/, 'sres'],
    [/^HB(\d+)$/, 'hr'],
    [/^SB(\d+)$/, 's'],
  ]

  for (const [pattern, type] of patterns) {
    const match = s.match(pattern)
    if (match) return { type, number: match[1]! }
  }

  return null
}

function mapStatus(statusId: number): string {
  switch (statusId) {
    case 1: return 'introduced'
    case 2: return 'passed_chamber'
    case 3: return 'passed'
    case 4: return 'passed'
    case 5: return 'vetoed'
    case 6: return 'failed'
    default: return 'introduced'
  }
}

function inferChamber(billNumber: string): string {
  const s = billNumber.trim().toUpperCase()
  if (s.startsWith('H')) return 'house'
  return 'senate'
}

function formatBillNumber(type: string, number: string): string {
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
  const prefix = BILL_TYPE_MAP[type] ?? type.toUpperCase()
  return `${prefix} ${number}`
}

// ─── Bill transformer ──────────────────────────────────────────────────────────

export function transformLegiScanBill(
  bill: LegiScanBillDetail,
  congressNumber: number,
): (Omit<Prisma.BillCreateInput, 'sponsor'> & { primarySponsorPeopleId?: number; cosponsorPeopleIds: number[] }) | null {
  const parsed = parseBillNumber(bill.bill_number)
  if (!parsed) {
    console.warn(`[LegiScan] Could not parse bill number: ${bill.bill_number}`)
    return null
  }

  const { type, number } = parsed
  const externalId = `congress:${congressNumber}:${type}:${number}`
  const billNumber = formatBillNumber(type, number)
  const status = mapStatus(bill.status_id)
  const chamber = inferChamber(bill.bill_number)

  const primarySponsor = bill.sponsors.find((s) => s.sponsor_type_id === 1)
  const cosponsors = bill.sponsors.filter((s) => s.sponsor_type_id === 2)

  const actions = bill.history.map((h) => ({
    date: h.date,
    text: h.action,
    chamber: h.chamber,
  }))

  const fullTextUrl = bill.texts?.[0]?.url ?? null

  return {
    externalId,
    source: 'congress',
    congressNumber,
    billType: type,
    billNumber,
    title: bill.title,
    summary: bill.description || null,
    status,
    chamber,
    level: 'federal',
    stateCode: null,
    introducedDate: null,
    lastActionDate: bill.status_date ? new Date(bill.status_date) : null,
    lastActionText: bill.history[bill.history.length - 1]?.action ?? null,
    url: null,
    fullTextUrl,
    actions: actions as Prisma.InputJsonValue,
    issueTags: [],
    lastSyncedAt: new Date(),
    rawData: bill as unknown as Prisma.InputJsonValue,
    primarySponsorPeopleId: primarySponsor?.people_id,
    cosponsorPeopleIds: cosponsors.map((s) => s.people_id),
  }
}

// ─── District helpers ──────────────────────────────────────────────────────────

/**
 * Extracts state code from LegiScan district strings.
 * Senators:      "SD-MN"    → "MN"
 * House reps:    "HD-MN-8"  → "MN"
 * At-large:      "HD-SD-AL" → "SD"
 */
export function parseStateFromDistrict(district: string): string {
  if (!district) return ''
  const parts = district.split('-')
  if (parts[0] === 'SD' || parts[0] === 'HD') {
    return parts[1] ?? ''
  }
  // Legacy fallback for plain "MN" or "MN-8"
  return parts[0] ?? ''
}

/**
 * Extracts district number from LegiScan district strings.
 * "HD-MN-8"  → "8"
 * "HD-SD-AL" → "AL"
 * "SD-MN"    → null  (senators have no district number)
 */
export function parseDistrictNumber(district: string): string | null {
  if (!district) return null
  const parts = district.split('-')
  if (parts[0] === 'HD' && parts[2]) return parts[2]
  return null
}

// ─── Person transformer ────────────────────────────────────────────────────────

export function normalizeParty(party: string): string {
  const p = party.trim().toUpperCase()
  if (p === 'D') return 'Democrat'
  if (p === 'R') return 'Republican'
  if (p === 'I') return 'Independent'
  return party
}

export function transformLegiScanPerson(person: LegiScanPerson): Prisma.RepresentativeCreateInput {
  return {
    externalId: `legiscan:${person.people_id}`,
    source: 'congress',
    fullName: person.name,
    party: normalizeParty(person.party),
    chamber: person.role_id === 2 ? 'senate' : 'house',  // 2=Senator, 1=Representative
    level: 'federal',
    stateCode: parseStateFromDistrict(person.district),
    district: parseDistrictNumber(person.district),
    title: person.role_id === 2 ? 'Senator' : 'Representative',
    isActive: true,
    lastSyncedAt: new Date(),
  }
}
