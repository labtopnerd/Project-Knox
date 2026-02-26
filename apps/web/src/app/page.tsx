import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LandingPage() {
  const session = await auth()
  if (session) redirect('/feed')

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary-900 to-primary-700 text-white">
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <div className="mb-6 inline-flex items-center rounded-full bg-primary-600 px-4 py-1.5 text-sm font-medium">
          Civic engagement made simple
        </div>
        <h1 className="mb-6 text-5xl font-bold leading-tight md:text-6xl">
          Your Voice on the <br />
          <span className="text-blue-300">Issues That Matter</span>
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-xl text-blue-100">
          Project Knox shows you the bills and policies your representatives are voting on —
          then makes it easy to vote on them yourself, see where your community stands,
          and contact your reps directly.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/register"
            className="rounded-lg bg-white px-8 py-3 text-lg font-semibold text-primary-700 shadow-lg transition hover:bg-blue-50"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-white/30 px-8 py-3 text-lg font-semibold text-white transition hover:bg-white/10"
          >
            Sign In
          </Link>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: '🗳️',
              title: 'Vote on Real Bills',
              description:
                'Express Support, Oppose, or Neutral on bills currently before Congress and your state legislature.',
            },
            {
              icon: '👥',
              title: 'Community Polling',
              description:
                'See how your district, state, and the nation feel about the same bills — in real time.',
            },
            {
              icon: '📬',
              title: 'Contact Your Reps',
              description:
                'Find your representatives and send them pre-filled messages with one click.',
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl bg-white/10 p-6 text-left backdrop-blur-sm"
            >
              <div className="mb-3 text-3xl">{feature.icon}</div>
              <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
              <p className="text-blue-100">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
