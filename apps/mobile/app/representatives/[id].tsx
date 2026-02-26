/**
 * Representative detail screen.
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
import { useQuery } from '@tanstack/react-query'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

interface RepDetail {
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
  websiteUrl?: string | null
  officeAddress?: string | null
  sponsoredBills: Array<{ id: string; billNumber: string | null; title: string; status: string }>
}

async function fetchRep(id: string): Promise<{ representative: RepDetail }> {
  const res = await fetch(`${API_URL}/api/representatives/${id}`)
  if (!res.ok) throw new Error('Not found')
  return res.json() as Promise<{ representative: RepDetail }>
}

const CHAMBER_LABELS: Record<string, string> = {
  senate: 'U.S. Senate',
  house: 'U.S. House of Representatives',
  state_senate: 'State Senate',
  state_house: 'State House',
}

export default function RepDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data, isLoading, error } = useQuery({
    queryKey: ['representative', id],
    queryFn: () => fetchRep(id),
    enabled: !!id,
  })

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
  }

  if (error || !data) {
    return <View style={styles.center}><Text style={styles.errorText}>Could not load representative.</Text></View>
  }

  const { representative: rep } = data

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: rep.fullName }} />

      {/* Profile */}
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{rep.fullName.charAt(0)}</Text>
        </View>
        <Text style={styles.name}>{rep.title ? `${rep.title} ` : ''}{rep.fullName}</Text>
        {rep.party && <Text style={styles.party}>{rep.party}</Text>}
        <Text style={styles.chamber}>
          {CHAMBER_LABELS[rep.chamber] ?? rep.chamber}
          {rep.stateCode ? ` — ${rep.stateCode}` : ''}
          {rep.district ? `, District ${rep.district}` : ''}
        </Text>
        {rep.officeAddress && <Text style={styles.address}>{rep.officeAddress}</Text>}
      </View>

      {/* Contact options */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Contact</Text>
        <View style={styles.contactRow}>
          {rep.phone && (
            <Pressable
              style={styles.contactBtn}
              onPress={() => void Linking.openURL(`tel:${rep.phone}`)}
            >
              <Text style={styles.contactBtnText}>📞 Call</Text>
            </Pressable>
          )}
          {rep.email && (
            <Pressable
              style={styles.contactBtn}
              onPress={() => void Linking.openURL(`mailto:${rep.email}`)}
            >
              <Text style={styles.contactBtnText}>✉️ Email</Text>
            </Pressable>
          )}
          {rep.contactFormUrl && (
            <Pressable
              style={styles.contactBtn}
              onPress={() => void Linking.openURL(rep.contactFormUrl!)}
            >
              <Text style={styles.contactBtnText}>🌐 Web form</Text>
            </Pressable>
          )}
          {rep.websiteUrl && (
            <Pressable
              style={styles.contactBtn}
              onPress={() => void Linking.openURL(rep.websiteUrl!)}
            >
              <Text style={styles.contactBtnText}>🔗 Website</Text>
            </Pressable>
          )}
        </View>

        <Link href={`/contact/${rep.id}`} asChild>
          <Pressable style={styles.sendMessageBtn}>
            <Text style={styles.sendMessageText}>📝 Send a message</Text>
          </Pressable>
        </Link>
      </View>

      {/* Sponsored bills */}
      {rep.sponsoredBills.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent sponsored legislation</Text>
          {rep.sponsoredBills.map((bill) => (
            <Link key={bill.id} href={`/bills/${bill.id}`} asChild>
              <Pressable style={styles.billRow}>
                {bill.billNumber && (
                  <Text style={styles.billNumber}>{bill.billNumber}</Text>
                )}
                <Text style={styles.billTitle} numberOfLines={2}>{bill.title}</Text>
                <Text style={styles.billStatus}>{bill.status.replace(/_/g, ' ')}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2, alignItems: 'flex-start' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center', marginBottom: 12, alignSelf: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#6b7280' },
  name: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', alignSelf: 'center', marginBottom: 4 },
  party: { fontSize: 13, color: '#6b7280', alignSelf: 'center', marginBottom: 4 },
  chamber: { fontSize: 13, color: '#6b7280', alignSelf: 'center', marginBottom: 4 },
  address: { fontSize: 12, color: '#9ca3af', alignSelf: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  contactBtn: { borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 8 },
  contactBtnText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  sendMessageBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center', width: '100%' },
  sendMessageText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  billRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', width: '100%' },
  billNumber: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  billTitle: { fontSize: 14, color: '#111827', fontWeight: '500', marginBottom: 2 },
  billStatus: { fontSize: 12, color: '#6b7280', textTransform: 'capitalize' },
  errorText: { color: '#dc2626' },
})
