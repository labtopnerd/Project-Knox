import { NavBar } from '@/components/layout/NavBar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
