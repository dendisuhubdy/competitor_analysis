import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, sitePassword, verifySession } from '@/lib/auth'

/**
 * Shared-password gate in front of the entire app.
 *
 * This exists because every analysis run costs real money against a server-side
 * API key. Without it, anyone who finds the URL can spend it.
 *
 * NOTE: this is `proxy.ts`, not `middleware.ts` — the middleware file
 * convention is deprecated and renamed as of Next.js 16. The runtime is Node.js
 * by default and the `runtime` config option throws if set, so don't add one.
 */
/**
 * Reachable without a session.
 *
 * `/` and `/sample` are the public face of the site: a visitor has to be able
 * to see what this is before being asked for a password they may not have.
 * `/login` and `/api/login` must stay open or there is no way in.
 *
 * Nothing that spends money is listed here. `/api/analyze` is the route that
 * costs ~$7 a call and it is deliberately absent — matched exactly, so a path
 * that merely starts with a public path is not itself public.
 */
const PUBLIC_PATHS = new Set(['/', '/sample', '/login', '/api/login'])

export async function proxy(request: NextRequest) {
  const password = sitePassword()

  // No password configured: the gate is off. That is the local-dev default, and
  // the deploy checklist requires SITE_PASSWORD to be set in production.
  if (!password) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (await verifySession(token, password)) return NextResponse.next()

  const { pathname, search } = request.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  // API callers get a status code they can act on. Redirecting an unauthorised
  // fetch to an HTML login page would surface as a JSON parse error instead.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const login = new URL('/login', request.url)
  // Send the visitor back where they were aiming once they are through. `/` no
  // longer needs excluding here — it is public and never reaches this line.
  login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  // Without a matcher the proxy runs on every request including static assets,
  // which would gate the CSS and JS the login page itself needs to render.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
}
