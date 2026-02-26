import { Stack } from 'expo-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
})

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="bills/[id]" options={{ title: 'Bill Detail' }} />
        <Stack.Screen name="representatives/[id]" options={{ title: 'Representative' }} />
        <Stack.Screen name="contact/[repId]" options={{ title: 'Contact Rep' }} />
        <Stack.Screen name="login" options={{ title: 'Sign In' }} />
      </Stack>
    </QueryClientProvider>
  )
}
