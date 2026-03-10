import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TRUSTED_PHOTO_DOMAINS = ['bioguide.congress.gov', 'unitedstates.github.io']

const CHAMBER_LABELS: Record<string, string> = {
  senate:       'U.S. Senate',
  house:        'U.S. House of Representatives',
  state_senate: 'State Senate',
  state_house:  'State House',
  local:        'Local Government',
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rep = await prisma.representative.findUnique({
    where: { id },
    select: { fullName: true, party: true, chamber: true, stateCode: true, title: true, photoUrl: true },
  })
  if (!rep) return new Response('Not found', { status: 404 })

  const chamberLabel = CHAMBER_LABELS[rep.chamber] ?? rep.chamber
  const subtitle = `${chamberLabel}${rep.stateCode ? ', ' + rep.stateCode : ''}`
  const initials = rep.fullName
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')

  // Only embed photo from trusted domains
  let photoSrc: string | null = null
  if (rep.photoUrl) {
    try {
      const hostname = new URL(rep.photoUrl).hostname
      if (TRUSTED_PHOTO_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))) {
        // Fetch to verify it's accessible
        const res = await fetch(rep.photoUrl)
        if (res.ok) photoSrc = rep.photoUrl
      }
    } catch {
      // fall back to initials
    }
  }

  const partyColor =
    rep.party === 'Democrat' ? '#1d4ed8' :
    rep.party === 'Republican' ? '#b91c1c' :
    '#7c3aed'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Left navy accent bar */}
        <div style={{ width: 120, backgroundColor: '#1e3a8a', flexShrink: 0 }} />

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 64px',
          }}
        >
          {/* Top: photo/initials + name + subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            {/* Avatar */}
            {photoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoSrc}
                alt={rep.fullName}
                width={120}
                height={120}
                style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  backgroundColor: '#1e3a8a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: 48,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
            )}

            {/* Name + subtitle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h1
                style={{
                  color: '#111827',
                  fontSize: 52,
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.15,
                }}
              >
                {rep.title ? `${rep.title} ` : ''}{rep.fullName}
              </h1>
              <p style={{ color: '#6b7280', fontSize: 26, margin: 0 }}>{subtitle}</p>
              {rep.party && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignSelf: 'flex-start',
                    backgroundColor: partyColor,
                    color: '#ffffff',
                    fontSize: 18,
                    fontWeight: 600,
                    padding: '4px 16px',
                    borderRadius: 999,
                    marginTop: 4,
                  }}
                >
                  {rep.party}
                </span>
              )}
            </div>
          </div>

          {/* Bottom: wordmark */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#1e3a8a', fontSize: 28, fontWeight: 700 }}>Project Knox</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
