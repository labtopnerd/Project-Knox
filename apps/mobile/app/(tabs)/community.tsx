/**
 * Community tab — shows trending bills and polling results.
 */

import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

interface AggregateWithBill {
  billId: string
  supportCount: number
  opposeCount: number
  neutralCount: number
  totalCount: number
  bill: {
    id: string
    billNumber: string | null
    title: string
    status: string
    chamber: string | null
    level: string
    stateCode: string | null
  }
}

async function fetchTrendingAggregates(): Promise<AggregateWithBill[]> {
  // Fetch trending bills via the API bills/trending endpoint
  const res = await fetch(`${API_URL}/api/bills/trending`)
  if (!res.ok) throw new Error('Failed to fetch trending')
  const data = await res.json() as { bills: Array<{ id: string; billNumber: string | null; title: string; status: string; chamber: string | null; level: string; stateCode: string | null; aggregates?: { supportCount: number; opposeCount: number; neutralCount: number; totalCount: number } | null }> }
  return data.bills
    .filter((b) => b.aggregates && b.aggregates.totalCount > 0)
    .map((b) => ({
      billId: b.id,
      supportCount: b.aggregates!.supportCount,
      opposeCount: b.aggregates!.opposeCount,
      neutralCount: b.aggregates!.neutralCount,
      totalCount: b.aggregates!.totalCount,
      bill: { id: b.id, billNumber: b.billNumber, title: b.title, status: b.status, chamber: b.chamber, level: b.level, stateCode: b.stateCode },
    }))
}

function PollBar({ support, oppose, neutral }: { support: number; oppose: number; neutral: number }) {
  return (
    <View style={styles.pollBar}>
      {support > 0 && <View style={[styles.pollSegment, styles.supportSegment, { flex: support }]} />}
      {neutral > 0 && <View style={[styles.pollSegment, styles.neutralSegment, { flex: neutral }]} />}
      {oppose > 0 && <View style={[styles.pollSegment, styles.opposeSegment, { flex: oppose }]} />}
    </View>
  )
}

function TrendingCard({ item }: { item: AggregateWithBill }) {
  const supportPct = item.totalCount ? Math.round((item.supportCount / item.totalCount) * 100) : 0
  const opposePct = item.totalCount ? Math.round((item.opposeCount / item.totalCount) * 100) : 0
  const neutralPct = 100 - supportPct - opposePct

  return (
    <Link href={`/bills/${item.bill.id}`} asChild>
      <Pressable style={styles.card}>
        {item.bill.billNumber && (
          <Text style={styles.billNumber}>{item.bill.billNumber}</Text>
        )}
        <Text style={styles.title} numberOfLines={3}>{item.bill.title}</Text>
        <PollBar support={supportPct} neutral={neutralPct} oppose={opposePct} />
        <View style={styles.pollLabels}>
          <Text style={[styles.pollLabel, styles.supportText]}>{supportPct}% Support</Text>
          <Text style={styles.voteCount}>{item.totalCount.toLocaleString()} votes</Text>
          <Text style={[styles.pollLabel, styles.opposeText]}>{opposePct}% Oppose</Text>
        </View>
      </Pressable>
    </Link>
  )
}

export default function CommunityScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trending'],
    queryFn: fetchTrendingAggregates,
  })

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load community data</Text>
        <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.billId}
      renderItem={({ item }) => <TrendingCard item={item} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <Text style={styles.sectionHeader}>🔥 Trending this week</Text>
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            No community votes yet. Be the first to vote on a bill in your feed!
          </Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  sectionHeader: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  billNumber: { fontSize: 11, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20, marginBottom: 12 },
  pollBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#f3f4f6', marginBottom: 6 },
  pollSegment: { height: '100%' },
  supportSegment: { backgroundColor: '#16a34a' },
  neutralSegment: { backgroundColor: '#d1d5db' },
  opposeSegment: { backgroundColor: '#dc2626' },
  pollLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pollLabel: { fontSize: 12, fontWeight: '600' },
  voteCount: { fontSize: 11, color: '#9ca3af' },
  supportText: { color: '#16a34a' },
  opposeText: { color: '#dc2626' },
  errorText: { color: '#dc2626', marginBottom: 12 },
  emptyText: { color: '#6b7280', textAlign: 'center' },
  retryBtn: { backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
})
