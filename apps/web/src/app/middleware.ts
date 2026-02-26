export { auth as middleware } from '@/lib/auth'

export const config = {
  // Protect all routes under /(app)
  matcher: [
    '/feed/:path*',
    '/bills/:path*',
    '/representatives/:path*',
    '/community/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/contact/:path*',
  ],
}
