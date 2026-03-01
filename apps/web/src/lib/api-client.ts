/**
 * Authenticated API client for client components.
 *
 * Fetches a short-lived JWT from the Next.js token-exchange route
 * (which reads the NextAuth session server-side), caches it for 55 minutes,
 * and injects `Authorization: Bearer <token>` into every Express API call.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

let cachedToken: string | null = null
let tokenExpiry = 0

async function getApiToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  try {
    const res = await fetch('/api/auth/api-token', { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json() as { token?: string }
    if (!data.token) return null
    cachedToken = data.token
    tokenExpiry = Date.now() + 55 * 60 * 1000 // refresh before 1h expiry
    return cachedToken
  } catch {
    return null
  }
}

/**
 * Drop-in replacement for fetch() pointing at the Express API.
 * Accepts either a path ("/api/bills") or a full URL (for URL-object callers).
 * Automatically adds the Authorization header when a session exists.
 */
export async function apiFetch(pathOrUrl: string, options: RequestInit = {}): Promise<Response> {
  const token = await getApiToken()
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_URL}${pathOrUrl}`
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
