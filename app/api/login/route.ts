import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sitePassword,
  issueSession,
} from '@/lib/auth'

/**
 * Exchanges the shared password for a session cookie. Reachable without a
 * session by design — `proxy.ts` exempts this path, or there would be no way in.
 */
export async function POST(request: Request) {
  const password = sitePassword()
  if (!password) {
    // Gate disabled. Nothing to log in to, and issuing a cookie signed with an
    // empty secret would be worse than refusing.
    return NextResponse.json(
      { error: 'No password is configured on this deployment.' },
      { status: 400 },
    )
  }

  let submitted: unknown
  try {
    submitted = (await request.json())?.password
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  if (typeof submitted !== 'string' || submitted !== password) {
    // Deliberately vague, and deliberately slow enough to make online guessing
    // tedious without affecting a legitimate single attempt.
    await new Promise((resolve) => setTimeout(resolve, 400))
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await issueSession(password),
    httpOnly: true,
    sameSite: 'lax',
    // Set only over TLS in production; locally the app is served over http and
    // a Secure cookie would be silently dropped.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}
