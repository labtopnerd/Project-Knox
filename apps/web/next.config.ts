import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'bioguide.congress.gov' },
      { protocol: 'https', hostname: 'www.congress.gov' },
      { protocol: 'https', hostname: '*.openstates.org' },
      { protocol: 'https', hostname: 'unitedstates.github.io' }, // Congress member photos
      { protocol: 'https', hostname: '*.senate.mn' }, // MN Senate photos
      { protocol: 'https', hostname: '*.house.gov' },
      { protocol: 'https', hostname: '*.senate.gov' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google OAuth avatars
    ],
  },
}

export default nextConfig
