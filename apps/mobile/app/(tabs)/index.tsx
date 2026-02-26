/**
 * Feed tab — shows bills from the user's representatives.
 * Connects to the shared Project Knox API.
 */

import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'
import type { BillListResponse, BillWithUserVote } from '@project-knox/types'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

async function fetchBills(): Promise<BillListResponse> {
  const res = await fetch(`${API_URL}/api/bills?forUser=true&limit=20`)
  if (!res.ok) throw new Error('Failed to fetch bills')
  return res.json() as Promise<BillListResponse>
}

function BillItem({ bill }: { bill: BillWithUserVote }) {
  return (
    <Link href={`/bills/${bill.id}`} asChild>
      <Pressable style={styles.card}>
        {bill.billNumber ? (
          <Text style={styles.billNumber}>{bill.billNumber}</Text>
        ) : null}
        <Text style={styles.title} numberOfLines={3}>
          {bill.title}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>{bill.status}</Text>
          {bill.stateCode ? <Text style={styles.metaText}>{bill.stateCode}</Text> : null}
        </View>
        {bill.aggregates && bill.aggregates.totalCount > 0 ? (
          <View style={styles.pollRow}>
            <Text style={[styles.pollText, styles.support]}>
              {Math.round((bill.aggregates.supportCount / bill.aggregates.totalCount) * 100)}% Support
            </Text>
            <Text style={styles.pollTotal}>{bill.aggregates.totalCount} votes</Text>
            <Text style={[styles.pollText, styles.oppose]}>
              {Math.round((bill.aggregates.opposeCount / bill.aggregates.totalCount) * 100)}% Oppose
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Link>
  )
}

export default function FeedScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bills', 'feed'],
    queryFn: fetchBills,
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
        <Text style={styles.errorText}>Failed to load bills</Text>
        <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      data={data?.bills}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <BillItem bill={item} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No bills found. Set your location in Profile.</Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  separator: { height: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
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
  title: { fontSize: 15, fontWeight: '600', color: '#111827', lineHeight: 22, marginBottom: 8 },
  meta: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  metaText: { fontSize: 12, color: '#6b7280' },
  pollRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  pollText: { fontSize: 12, fontWeight: '600' },
  pollTotal: { fontSize: 11, color: '#9ca3af' },
  support: { color: '#16a34a' },
  oppose: { color: '#dc2626' },
  errorText: { color: '#dc2626', marginBottom: 12 },
  retryBtn: { backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
})
