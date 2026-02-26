/**
 * Login screen — for future JWT authentication in the mobile app.
 * Currently shows account linking instructions pointing to the web app.
 *
 * Phase 3: Implement full JWT auth flow using the Express API.
 */

import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useAuthStore } from '../store/auth'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000'

export default function LoginScreen() {
  const router = useRouter()
  const setToken = useAuthStore((s) => s.setToken)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json() as { token?: string; error?: string; message?: string }

      if (!res.ok || !data.token) {
        setError(data.message ?? 'Invalid email or password.')
        return
      }

      // Persist token in SecureStore for future sessions
      await setToken(data.token)

      router.replace('/(tabs)')
    } catch {
      setError('Could not connect. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.logoArea}>
        <Text style={styles.logo}>🏛️</Text>
        <Text style={styles.appName}>Project Knox</Text>
        <Text style={styles.tagline}>Your voice on the issues that matter</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sign in</Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="current-password"
        />

        <Pressable
          onPress={handleLogin}
          disabled={loading || !email || !password}
          style={[styles.loginBtn, (loading || !email || !password) && styles.loginBtnDisabled]}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginBtnText}>Sign in</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.altSection}>
        <Text style={styles.altText}>Don't have an account or use Google/GitHub?</Text>
        <Pressable
          style={styles.webBtn}
          onPress={() => void Linking.openURL(`${WEB_URL}/register`)}
        >
          <Text style={styles.webBtnText}>Sign up on the web →</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.skipText}>Browse without an account</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 24, alignItems: 'center' },
  logoArea: { alignItems: 'center', marginBottom: 32, marginTop: 48 },
  logo: { fontSize: 56, marginBottom: 8 },
  appName: { fontSize: 26, fontWeight: '800', color: '#1e3a8a' },
  tagline: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  errorBox: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 14 },
  errorText: { fontSize: 13, color: '#b91c1c' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb', marginBottom: 12 },
  loginBtn: { backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  altSection: { width: '100%', alignItems: 'center', marginBottom: 16 },
  altText: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 10 },
  webBtn: { borderWidth: 1, borderColor: '#2563eb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24 },
  webBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  skipText: { fontSize: 13, color: '#9ca3af', textDecorationLine: 'underline' },
})
