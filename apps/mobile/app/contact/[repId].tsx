/**
 * Contact representative screen — pre-filled templates, send via email/form/phone.
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
  Alert,
} from 'react-native'
import { useState } from 'react'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

interface Rep {
  id: string
  fullName: string
  title?: string | null
  phone?: string | null
  email?: string | null
  contactFormUrl?: string | null
}

async function fetchRep(id: string): Promise<Rep> {
  const res = await fetch(`${API_URL}/api/representatives/${id}`)
  if (!res.ok) throw new Error('Not found')
  const data = await res.json() as { representative: Rep }
  return data.representative
}

const TEMPLATES = [
  {
    label: 'Support',
    subject: (title: string) => `I Support: ${title}`,
    body: (repName: string, title: string) =>
      `Dear ${repName},\n\nI am writing as your constituent to express my strong support for ${title}.\n\nI urge you to vote YES on this bill.\n\nSincerely,\n[Your Name]`,
  },
  {
    label: 'Oppose',
    subject: (title: string) => `I Oppose: ${title}`,
    body: (repName: string, title: string) =>
      `Dear ${repName},\n\nI am writing to express my opposition to ${title}.\n\nI urge you to vote NO.\n\nSincerely,\n[Your Name]`,
  },
]

export default function ContactScreen() {
  const { repId, billId, billTitle: rawBillTitle } = useLocalSearchParams<{
    repId: string
    billId?: string
    billTitle?: string
  }>()
  const router = useRouter()
  const billTitle = rawBillTitle ? decodeURIComponent(rawBillTitle) : undefined

  const { data: rep, isLoading } = useQuery({
    queryKey: ['representative', repId],
    queryFn: () => fetchRep(repId),
    enabled: !!repId,
  })

  const [subject, setSubject] = useState(billTitle ? `Re: ${billTitle}` : '')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const applyTemplate = (tpl: (typeof TEMPLATES)[0]) => {
    if (!rep || !billTitle) return
    setSubject(tpl.subject(billTitle))
    setBody(tpl.body(rep.title ? `${rep.title} ${rep.fullName}` : rep.fullName, billTitle))
  }

  const handleSend = async () => {
    if (!rep || body.trim().length < 10) return
    setSending(true)

    try {
      await fetch(`${API_URL}/api/contact/${rep.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: billId ?? null,
          channel: rep.email ? 'email' : 'form',
          subject,
          body,
        }),
      })

      // Open the appropriate contact channel
      if (rep.contactFormUrl) {
        void Linking.openURL(rep.contactFormUrl)
      } else if (rep.email) {
        void Linking.openURL(
          `mailto:${rep.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
        )
      }

      Alert.alert('Message logged!', 'Your message has been saved. Open the contact form or email app to send it.', [
        { text: 'Done', onPress: () => router.back() },
      ])
    } catch {
      Alert.alert('Error', 'Could not send message. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
  }

  if (!rep) {
    return <View style={styles.center}><Text>Representative not found.</Text></View>
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Contact ${rep.fullName}` }} />

      {/* Contact quick actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick contact</Text>
        <View style={styles.quickRow}>
          {rep.phone && (
            <Pressable style={styles.quickBtn} onPress={() => void Linking.openURL(`tel:${rep.phone}`)}>
              <Text style={styles.quickBtnText}>📞 {rep.phone}</Text>
            </Pressable>
          )}
          {rep.contactFormUrl && (
            <Pressable style={styles.quickBtn} onPress={() => void Linking.openURL(rep.contactFormUrl!)}>
              <Text style={styles.quickBtnText}>🌐 Official form</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Templates */}
      {billTitle && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick templates</Text>
          <View style={styles.templateRow}>
            {TEMPLATES.map((tpl) => (
              <Pressable key={tpl.label} style={styles.templateBtn} onPress={() => applyTemplate(tpl)}>
                <Text style={styles.templateBtnText}>{tpl.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Message form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Write your message</Text>

        <Text style={styles.label}>Subject</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          style={styles.input}
          placeholder="Subject line…"
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          style={[styles.input, styles.textarea]}
          placeholder="Your message to your representative…"
          multiline
          numberOfLines={8}
          textAlignVertical="top"
        />

        <Text style={styles.hint}>
          Personalize with your name and address before sending.
        </Text>

        <Pressable
          onPress={handleSend}
          disabled={sending || body.trim().length < 10}
          style={[styles.sendBtn, (sending || body.trim().length < 10) && styles.sendBtnDisabled]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>📤 Log & send message</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
  quickRow: { gap: 8 },
  quickBtn: { borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', padding: 10 },
  quickBtnText: { fontSize: 13, color: '#374151' },
  templateRow: { flexDirection: 'row', gap: 8 },
  templateBtn: { borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingVertical: 6 },
  templateBtnText: { fontSize: 12, color: '#374151' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb', marginBottom: 12 },
  textarea: { height: 160, paddingTop: 10 },
  hint: { fontSize: 12, color: '#9ca3af', marginBottom: 16 },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
})
