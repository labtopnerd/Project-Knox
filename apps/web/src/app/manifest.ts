import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Project Knox',
    short_name: 'Knox',
    description: 'Vote on real bills, track your representatives, make your voice heard.',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#1e3a8a',
    orientation: 'portrait-primary',
    categories: ['government', 'politics', 'news'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        // @ts-expect-error — purpose is valid in the Web App Manifest spec
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/feed.png',
        sizes: '1280x720',
        // @ts-expect-error — type is optional per spec
        type: 'image/png',
        label: 'Bill feed with community opinions',
      },
    ],
  }
}
