/**
 * Bill detail screen — shows summary, community poll, and vote buttons.
 */

import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native'
import { useLocalSearchParams, Link, Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { BillWithUserVote, VotePosition } from '@project-knox/types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

async function fetchBill(id: string): Promise<BillWithUserVote> {
  const res = await fetch(`${API_URL}/api/bills/${id}`)
  if (!res.ok) throw new Error('Failed to fetch bill')
  return res.json() as Promise<BillWithUserVote>
}

async function castVote(billId: string, position: VotePosition): Promise<void> {
  const res = await fetch(`${API_URL}/api/bills/${billId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position }),
  })
  if (!res.ok) throw new Error('Failed to vote')
}

const STATUS_COLORS: Record<string, string> = {
  introduced: '#dbeafe',
  committee: '#fef9c3',
  floor: '#fed7aa',
  passed_chamber: '#e0e7ff',
  passed: '#dcfce7',
  signed: '#bbf7d0',
  failed: '#fee2e2',
  vetoed: '#fecaca',
}

function PollBar({ supportCount, opposeCount, neutralCount, totalCount }: {
  supportCount: number; opposeCount: number; neutralCount: number; totalCount: number
}) {
  if (totalCount === 0) {
    return <Text style={styles.noPollText}>No votes yet — be the first!</Text>
  }

  const sPct = Math.round((supportCount / totalCount) * 100)
  const oPct = Math.round((opposeCount / totalCount) * 100)
  const nPct = 100 - sPct - oPct

  return (
    <View>
      <View style={styles.pollBar}>
        {sPct > 0 && <View style={[styles.pollSegment, { backgroundColor: '#16a34a', flex: sPct }]} />}
        {nPct > 0 && <View style={[styles.pollSegment, { backgroundColor: '#d1d5db', flex: nPct }]} />}
        {oPct > 0 && <View style={[styles.pollSegment, { backgroundColor: '#dc2626', flex: oPct }]} />}
      </View>
      <View style={styles.pollLabels}>
        <Text style={[styles.pollPct, { color: '#16a34a' }]}>{sPct}% Support</Text>
        <Text style={styles.totalVotes}>{totalCount.toLocaleString()} votes</Text>
        <Text style={[styles.pollPct, { color: '#dc2626' }]}>{oPct}% Oppose</Text>
      </View>
    </View>
  )
}

export default function BillDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: bill, isLoading, error } = useQuery({
    queryKey: ['bill', id],
    queryFn: () => fetchBill(id),
    enabled: !!id,
  })

  const { mutate: vote, isPending: voting } = useMutation({
    mutationFn: (position: VotePosition) => castVote(id, position),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bill', id] })
      void queryClient.invalidateQueries({ queryKey: ['bills'] })
    },
  })

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (error || !bill) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not load this bill.</Text>
      </View>
    )
  }

  const statusColor = STATUS_COLORS[bill.status] ?? '#f3f4f6'
  const statusLabel = bill.status.replace(/_/g, ' ')

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: bill.billNumber ?? 'Bill Detail' }} />

      {/* Header */}
      <View style={styles.card}>
        {bill.billNumber && <Text style={styles.billNumber}>{bill.billNumber}</Text>}
        <Text style={styles.title}>{bill.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        {bill.lastActionDate && (
          <Text style={styles.meta}>
            Last action: {new Date(bill.lastActionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        )}
        {bill.url && (
          <Pressable onPress={() => void Linking.openURL(bill.url!)}>
            <Text style={styles.link}>View official bill →</Text>
          </Pressable>
        )}
        {bill.issueTags.length > 0 && (
          <View style={styles.tags}>
            {bill.issueTags.slice(0, 5).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Summary */}
      {bill.summary && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summary}>{bill.summary}</Text>
        </View>
      )}

      {/* Full text */}
      {bill.fullTextUrl && (
        <Pressable
          style={styles.fullTextBtn}
          onPress={() => void Linking.openURL(bill.fullTextUrl!)}
        >
          <Text style={styles.fullTextBtnText}>📄 Read full bill text</Text>
        </Pressable>
      )}

      {/* Community poll */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Community opinion</Text>
        {bill.aggregates ? (
          <PollBar
            supportCount={bill.aggregates.supportCount}
            opposeCount={bill.aggregates.opposeCount}
            neutralCount={bill.aggregates.neutralCount}
            totalCount={bill.aggregates.totalCount}
          />
        ) : (
          <Text style={styles.noPollText}>No votes yet</Text>
        )}

        <View style={styles.voteRow}>
          {(['support', 'neutral', 'oppose'] as VotePosition[]).map((pos) => {
            const isActive = bill.userVote === pos
            const colors: Record<VotePosition, { bg: string; text: string; activeBg: string }> = {
              support: { bg: '#fff', text: '#374151', activeBg: '#16a34a' },
              neutral: { bg: '#fff', text: '#374151', activeBg: '#6b7280' },
              oppose: { bg: '#fff', text: '#374151', activeBg: '#dc2626' },
            }
            const c = colors[pos]
            const label = pos.charAt(0).toUpperCase() + pos.slice(1)

            return (
              <Pressable
                key={pos}
                onPress={() => vote(pos)}
                disabled={voting}
                style={[
                  styles.voteBtn,
                  isActive ? { backgroundColor: c.activeBg, borderColor: c.activeBg } : {},
                ]}
              >
                <Text style={[styles.voteBtnText, isActive && { color: '#fff' }]}>{label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Contact sponsor */}
      {bill.sponsorId && (
        <Link href={`/contact/${bill.sponsorId}?billId=${bill.id}`} asChild>
          <Pressable style={styles.contactBtn}>
            <Text style={styles.contactBtnText}>📬 Contact the sponsor</Text>
          </Pressable>
        </Link>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  billNumber: { fontSize: 11, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827', lineHeight: 24, marginBottom: 10 },
  statusBadge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#374151', textTransform: 'capitalize' },
  meta: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  link: { fontSize: 13, color: '#2563eb', fontWeight: '500', marginTop: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { backgroundColor: '#eff6ff', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, color: '#1d4ed8', fontWeight: '500' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  summary: { fontSize: 14, color: '#374151', lineHeight: 21 },
  pollBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#f3f4f6', marginBottom: 8 },
  pollSegment: { height: '100%' },
  pollLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  pollPct: { fontSize: 12, fontWeight: '600' },
  totalVotes: { fontSize: 11, color: '#9ca3af' },
  noPollText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic', marginBottom: 12 },
  voteRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  voteBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', paddingVertical: 10, alignItems: 'center' },
  voteBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  contactBtn: { backgroundColor: '#1e3a8a', borderRadius: 12, padding: 16, alignItems: 'center' },
  contactBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  fullTextBtn: { backgroundColor: '#1f2937', borderRadius: 12, padding: 14, alignItems: 'center' },
  fullTextBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  errorText: { color: '#dc2626' },
})
