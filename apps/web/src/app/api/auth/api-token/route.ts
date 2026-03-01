/**
 * GET /api/auth/api-token
 *
 * Exchanges the NextAuth session cookie (same-origin) for a short-lived JWT
 * that the Express API can verify with JWT_SECRET. Client components call this
 * once, cache the result for 55 minutes, and include it as `Authorization: Bearer`.
 */

import { auth } from '@/lib/auth'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secret = process.env.JWT_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const token = await new SignJWT({ userId: session.user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret))

  return NextResponse.json({ token })
}
