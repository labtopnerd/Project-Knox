import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { useAuthStore } from '../store/auth'
import { registerForPushNotifications } from '../lib/notifications'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

function AuthLoader({ children }: { children: React.ReactNode }) {
  const loadToken = useAuthStore((s) => s.loadToken)
  const token = useAuthStore((s) => s.token)
  const isLoading = useAuthStore((s) => s.isLoading)

  useEffect(() => { void loadToken() }, [loadToken])

  // Once auth state is resolved, register for push notifications.
  // Passes the JWT so the API can associate the device token with the user.
  useEffect(() => {
    if (!isLoading) {
      void registerForPushNotifications(token)
    }
  }, [isLoading, token])

  return <>{children}</>
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthLoader>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="bills/[id]" options={{ title: 'Bill Detail' }} />
          <Stack.Screen name="representatives/[id]" options={{ title: 'Representative' }} />
          <Stack.Screen name="contact/[repId]" options={{ title: 'Contact Rep' }} />
          <Stack.Screen name="login" options={{ title: 'Sign In' }} />
        </Stack>
      </AuthLoader>
    </QueryClientProvider>
  )
}
