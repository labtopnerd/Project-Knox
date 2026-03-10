/**
 * Transform VoteSmart API responses into Project Knox database schema format.
 */

import type { Prisma } from '@prisma/client'
import type { VoteSmartOfficial } from './client'

export function transformVoteSmartOfficial(
  official: VoteSmartOfficial,
  stateCode: string,
): Prisma.RepresentativeCreateInput {
  return {
    externalId: `votesmart:${official.candidateId}`,
    source: 'votesmart',
    fullName: `${official.firstName} ${official.lastName}`.trim(),
    title: official.office.name,
    chamber: 'local',
    level: 'local',
    stateCode,
    party: null, // not provided by Officials.getByZip
    photoUrl: official.photo ?? null,
    websiteUrl: official.website ?? null,
    email: official.email ?? null,
    phone: official.phone ?? null,
    isActive: true,
    lastSyncedAt: new Date(),
  }
}
