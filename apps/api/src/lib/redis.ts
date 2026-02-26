import Redis from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL
    if (!url) {
      throw new Error('REDIS_URL or UPSTASH_REDIS_REST_URL environment variable is required')
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
} as const

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis()
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
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (err) {
    console.error('[Redis] Cache set error:', err)
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const client = getRedis()
    await client.del(key)
  } catch (err) {
    console.error('[Redis] Cache delete error:', err)
  }
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const client = getRedis()
    const keys = await client.keys(pattern)
    if (keys.length > 0) {
      await client.del(...keys)
    }
  } catch (err) {
    console.error('[Redis] Cache delete pattern error:', err)
  }
}
