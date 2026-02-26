/**
 * Profile tab — location setup and account info.
 * Uses JWT token stored in memory (replace with SecureStore in production).
 */

import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../../store/auth'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function ProfileScreen() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { token, signOut } = useAuthStore()
  const [lookupInput, setLookupInput] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupResult, setLookupResult] = useState<string | null>(null)

  const handleSignOut = async () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          queryClient.clear()
          router.replace('/login')
        },
      },
    ])
  }

  const handleLookup = async () => {
    if (!lookupInput.trim()) return

    setLookupLoading(true)
    setLookupResult(null)

    try {
      const isZip = /^\d{5}$/.test(lookupInput.trim())
      const body = isZip ? { zipCode: lookupInput.trim() } : { address: lookupInput.trim() }

      const res = await fetch(`${API_URL}/api/representatives/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json() as {
        location?: { stateCode: string; matchedAddress: string }
        representatives?: unknown[]
        error?: string
      }

      if (!res.ok || data.error) {
        setLookupResult('Could not find representatives. Try a full address (e.g., "123 Main St, Springfield, IL 62701").')
      } else {
        const count = data.representatives?.length ?? 0
        setLookupResult(
          `Found ${count} representative${count !== 1 ? 's' : ''} for ${data.location?.stateCode ?? 'your location'}. Your feed has been updated!`,
        )
        // Invalidate queries so the feed and reps tabs refresh
        void queryClient.invalidateQueries({ queryKey: ['bills'] })
        void queryClient.invalidateQueries({ queryKey: ['representatives'] })
      }
    } catch {
      setLookupResult('Something went wrong. Check your connection and try again.')
    } finally {
      setLookupLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Profile & Settings</Text>
      </View>

      {/* Location section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 Your location</Text>
        <Text style={styles.sectionDesc}>
          Enter your address or zip code to find your representatives and personalize your bill feed.
        </Text>

        <TextInput
          value={lookupInput}
          onChangeText={setLookupInput}
          placeholder="Address or zip code…"
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={handleLookup}
        />

        <Pressable
          onPress={handleLookup}
          disabled={lookupLoading || !lookupInput.trim()}
          style={[styles.btn, (lookupLoading || !lookupInput.trim()) && styles.btnDisabled]}
        >
          {lookupLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Find my representatives</Text>
          )}
        </Pressable>

        {lookupResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{lookupResult}</Text>
          </View>
        )}
      </View>

      {/* App info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ About Project Knox</Text>
        <Text style={styles.sectionDesc}>
          Project Knox is a civic engagement platform that lets you vote on real bills, track your representatives,
          and contact them directly.
        </Text>
        <Text style={[styles.sectionDesc, { marginTop: 8 }]}>
          Data sources: Congress.gov (federal), OpenStates (state), US Census (geocoding)
        </Text>
      </View>

      {/* Account section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 Account</Text>
        {token ? (
          <>
            <Text style={styles.sectionDesc}>
              You are signed in. Your votes and preferences are synced to your account.
            </Text>
            <Pressable style={[styles.btn, styles.signOutBtn]} onPress={handleSignOut}>
              <Text style={styles.signOutBtnText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sectionDesc}>
              Sign in to save your votes and sync preferences across devices.
            </Text>
            <Pressable style={[styles.btn, { marginTop: 12 }]} onPress={() => router.push('/login')}>
              <Text style={styles.btnText}>Sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16 },
  header: { marginBottom: 20 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  sectionDesc: { fontSize: 13, color: '#6b7280', lineHeight: 19 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginTop: 12,
    marginBottom: 10,
  },
  btn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  signOutBtn: { backgroundColor: '#dc2626', marginTop: 12 },
  signOutBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  resultBox: {
    marginTop: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  resultText: { fontSize: 13, color: '#166534' },
})
