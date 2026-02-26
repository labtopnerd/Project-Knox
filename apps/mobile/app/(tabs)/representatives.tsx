/**
 * Representatives tab — shows the user's elected officials.
 */

import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'expo-router'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

interface Rep {
  id: string
  fullName: string
  title?: string | null
  party?: string | null
  chamber: string
  level: string
  stateCode?: string | null
  district?: string | null
  phone?: string | null
  email?: string | null
  contactFormUrl?: string | null
  photoUrl?: string | null
}

async function fetchMyReps(): Promise<Rep[]> {
  const res = await fetch(`${API_URL}/api/representatives?forUser=true`)
  if (!res.ok) throw new Error('Failed to fetch representatives')
  const data = await res.json() as { representatives: Rep[] }
  return data.representatives
}

const PARTY_COLORS: Record<string, string> = {
  Democrat: '#dbeafe',
  Republican: '#fee2e2',
  Independent: '#f3e8ff',
}

const CHAMBER_LABELS: Record<string, string> = {
  senate: 'U.S. Senate',
  house: 'U.S. House',
  state_senate: 'State Senate',
  state_house: 'State House',
  local: 'Local Government',
}

function RepCard({ rep }: { rep: Rep }) {
  const partyColor = PARTY_COLORS[rep.party ?? ''] ?? '#f9fafb'

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{rep.fullName.charAt(0)}</Text>
        </View>
        <View style={styles.repInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.repName} numberOfLines={1}>
              {rep.title ? `${rep.title} ` : ''}{rep.fullName}
            </Text>
            {rep.party && (
              <View style={[styles.partyBadge, { backgroundColor: partyColor }]}>
                <Text style={styles.partyText}>{rep.party.charAt(0)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.chamberText}>
            {CHAMBER_LABELS[rep.chamber] ?? rep.chamber}
            {rep.stateCode ? ` — ${rep.stateCode}` : ''}
            {rep.district ? `, Dist. ${rep.district}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Link href={`/representatives/${rep.id}`} asChild>
          <Pressable style={styles.actionBtn}>
            <Text style={styles.actionBtnText}>View profile</Text>
          </Pressable>
        </Link>
        {rep.phone && (
          <Pressable
            style={[styles.actionBtn, styles.primaryBtn]}
            onPress={() => void Linking.openURL(`tel:${rep.phone}`)}
          >
            <Text style={[styles.actionBtnText, styles.primaryBtnText]}>📞 Call</Text>
          </Pressable>
        )}
        <Link href={`/contact/${rep.id}`} asChild>
          <Pressable style={[styles.actionBtn, styles.primaryBtn]}>
            <Text style={[styles.actionBtnText, styles.primaryBtnText]}>✉️ Contact</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  )
}

export default function RepresentativesScreen() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['representatives', 'mine'],
    queryFn: fetchMyReps,
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
        <Text style={styles.errorText}>Failed to load representatives</Text>
        <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <RepCard rep={item} />}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <Text style={styles.sectionHeader}>Your Representatives</Text>
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No representatives found</Text>
          <Text style={styles.emptyText}>
            Go to Profile and set your address to find your representatives.
          </Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
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
  cardHeader: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: '#6b7280' },
  repInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  repName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  partyBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  partyText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  chamberText: { fontSize: 12, color: '#6b7280' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionBtnText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  primaryBtn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  primaryBtnText: { color: '#fff' },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 8, textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  errorText: { color: '#dc2626', marginBottom: 12 },
  retryBtn: { backgroundColor: '#2563eb', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
})
