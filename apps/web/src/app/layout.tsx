import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'Project Knox — Your Voice on the Issues That Matter',
    template: '%s | Project Knox',
  },
  description:
    'Vote on bills and policies being considered by your representatives. See where your community stands. Contact your reps directly.',
  keywords: ['civic engagement', 'bills', 'representatives', 'voting', 'politics', 'democracy'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Project Knox',
  },
  openGraph: {
    title: 'Project Knox',
    description: 'Your voice on the issues that matter',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
