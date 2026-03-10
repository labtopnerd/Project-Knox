import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bill = await prisma.bill.findUnique({
    where: { id },
    select: { title: true, billNumber: true, status: true },
  })
  if (!bill) return new Response('Not found', { status: 404 })

  const statusLabel = bill.status
    ? bill.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#1e3a8a',
          padding: '56px 64px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top: bill number */}
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {bill.billNumber && (
            <span
              style={{
                color: '#93c5fd',
                fontSize: 22,
                fontFamily: 'monospace',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {bill.billNumber}
            </span>
          )}
        </div>

        {/* Center: title */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            maxHeight: 260,
            overflow: 'hidden',
          }}
        >
          <h1
            style={{
              color: '#ffffff',
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
              // clamp to ~2 lines
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {bill.title}
          </h1>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#bfdbfe', fontSize: 28, fontWeight: 700 }}>Project Knox</span>
          {statusLabel && (
            <span
              style={{
                backgroundColor: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                fontSize: 18,
                fontWeight: 600,
                padding: '8px 20px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              {statusLabel}
            </span>
          )}
        </div>
      </div>
    ),
    { ...size },
  )
}
