import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Vote, Users, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default async function LandingPage() {
  const session = await auth()
  if (session) redirect('/feed')

  const features = [
    {
      icon: Vote,
      title: 'Vote on Real Bills',
      description:
        'Express Support, Oppose, or Neutral on bills currently before Congress and your state legislature.',
    },
    {
      icon: Users,
      title: 'Community Polling',
      description:
        'See how your district, state, and the nation feel about the same bills — in real time.',
    },
    {
      icon: Mail,
      title: 'Contact Your Reps',
      description:
        'Find your representatives and send them pre-filled messages with one click.',
    },
  ]

  return (
    <main className="min-h-screen bg-white dark:bg-slate-900">
      {/* Navbar strip */}
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 text-sm font-bold text-white">
              KN
            </div>
            <span className="font-bold text-slate-900 dark:text-white">Knox</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild className="text-slate-600 hover:text-slate-900 dark:text-slate-300">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="bg-navy-900 hover:bg-navy-800 text-white">
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-24">
        <div className="mb-4 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          Civic engagement made simple
        </div>
        <h1 className="mb-6 max-w-2xl text-5xl font-extrabold leading-tight tracking-tight text-slate-900 dark:text-white md:text-6xl">
          <span className="text-navy-900 dark:text-blue-400">Your Voice</span>
          <br />
          <span className="text-crimson-600 dark:text-red-400">on the Issues</span>
        </h1>
        <p className="mb-10 max-w-xl text-lg text-slate-500 dark:text-slate-400">
          Project Knox shows you the bills your representatives are voting on — then makes
          it easy to weigh in yourself, see where your community stands, and contact your
          reps directly.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button asChild size="lg" className="bg-navy-900 hover:bg-navy-800 px-8 text-white">
            <Link href="/register">Get Started Free</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-crimson-600 text-crimson-600 hover:bg-crimson-50 dark:hover:bg-slate-800 px-8">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <Card key={title} className="border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex rounded-lg bg-navy-50 p-2.5 dark:bg-navy-900/30">
                    <Icon className="h-5 w-5 text-navy-900 dark:text-blue-400" />
                  </div>
                  <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-navy-900 text-xs font-bold text-white">
              KN
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Knox</span>
          </div>
          <nav className="flex gap-6 text-sm text-slate-500 dark:text-slate-400">
            <Link href="/login" className="hover:text-slate-900 dark:hover:text-white">Sign in</Link>
            <Link href="/register" className="hover:text-slate-900 dark:hover:text-white">Register</Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}
