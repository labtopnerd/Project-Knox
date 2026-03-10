import Redis from 'ioredis'

let redis: Redis | null = null
let redisUnavailable = false

function getRedis(): Redis | null {
  if (redisUnavailable) return null
  if (!redis) {
    const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL
    if (!url) {
      // Cache is optional — degrade gracefully without Redis
      if (process.env.NODE_ENV !== 'test') {
        console.warn('[Redis] No REDIS_URL set — caching disabled. Set REDIS_URL for production.')
      }
      redisUnavailable = true
      return null
    }
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })
    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err)
    })
  }
  return redis
}

// Cache TTLs in seconds
export const TTL = {
  REPS_BY_ADDRESS: 86400,    // 24 hours — representatives don't change often
  REPS_BY_ID: 86400,         // 24 hours
  BILLS_LIST: 3600,          // 1 hour
  BILL_DETAIL: 1800,         // 30 minutes
  BILL_AGGREGATES: 300,      // 5 minutes — frequently updated
  CENSUS_GEOCODE: 604800,    // 7 days — geocoding results are stable
  LEGISCAN_SESSION: 86400,   // 24h — session list is stable
  LEGISCAN_MASTER: 3600,     // 1h  — master bill list
  LEGISCAN_BILL: 1800,       // 30m — bill detail
  LEGISCAN_PEOPLE: 86400,    // 24h — session people list
  LEGISCAN_ROLLCALL: 86400,  // 24h — roll calls are immutable once recorded
  LEGISCAN_SPONSORED: 3600,  // 1h  — sponsored bill list per person
  LEGISCAN_BIO: 86400,       // 24h — person bio and session list (stable)
  LEGISCAN_PERSON_VOTES: 3600, // 1h — all votes for a person (filter client-side by session)
  HISTORY_TRIGGER: 86400,    // 24h — rate gate for the /sync-history endpoint per rep
} as const

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis()
    if (!client) return null
    const value = await client.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const client = getRedis()
    if (!client) return
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (err) {
    console.error('[Redis] Cache set error:', err)
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const client = getRedis()
    if (!client) return
    await client.del(key)
  } catch (err) {
    console.error('[Redis] Cache delete error:', err)
  }
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const client = getRedis()
    if (!client) return
    const keys = await client.keys(pattern)
    if (keys.length > 0) {
      await client.del(...keys)
    }
  } catch (err) {
    console.error('[Redis] Cache delete pattern error:', err)
  }
}
