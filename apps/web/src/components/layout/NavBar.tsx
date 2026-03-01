'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LayoutDashboard, Users, BarChart2, Settings, LogOut, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { href: '/feed' as const, label: 'My Feed', icon: LayoutDashboard },
  { href: '/representatives' as const, label: 'My Reps', icon: Users },
  { href: '/community' as const, label: 'Community', icon: BarChart2 },
  { href: '/settings' as const, label: 'Settings', icon: Settings },
]

export function NavBar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  const userInitial =
    session?.user?.name?.charAt(0) ?? session?.user?.email?.charAt(0) ?? '?'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-white transition-shadow dark:bg-slate-900',
        'border-slate-200 dark:border-slate-800',
        scrolled && 'shadow-sm',
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/feed" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-navy-900 text-sm font-bold text-white">
            KN
          </div>
          <span className="hidden font-bold text-slate-900 sm:inline dark:text-white">Knox</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'text-navy-900 underline decoration-navy-900 decoration-2 underline-offset-4 dark:text-blue-400 dark:decoration-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop user menu */}
        <div className="hidden items-center md:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-navy-900 focus:ring-offset-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session?.user?.image ?? undefined} alt={session?.user?.name ?? 'User'} />
                  <AvatarFallback className="bg-navy-100 text-navy-900 text-xs font-semibold dark:bg-navy-800 dark:text-blue-200">
                    {userInitial.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {session?.user?.name && (
                <>
                  <div className="px-2 py-1.5 text-sm font-medium text-slate-900 dark:text-white">
                    {session.user.name}
                  </div>
                  <DropdownMenuSeparator />
                </>
              )}
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-crimson-600 focus:text-crimson-600"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile hamburger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64 p-0">
            <SheetHeader className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <SheetTitle className="flex items-center gap-2.5 text-left">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-navy-900 text-xs font-bold text-white">
                  KN
                </div>
                <span className="font-bold text-slate-900 dark:text-white">Knox</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="px-2 py-3">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                    pathname.startsWith(href)
                      ? 'bg-navy-50 text-navy-900 dark:bg-slate-800 dark:text-blue-400'
                      : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
              <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-crimson-600 hover:bg-crimson-50 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
