import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { SESSION_COOKIE, issueSession } from '@/lib/auth'

const PASSWORD = 'test-password'

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(`https://checkcompetition.org${path}`)
  if (cookie) req.cookies.set(SESSION_COOKIE, cookie)
  return req
}

describe('proxy gate', () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD
  })
  afterEach(() => {
    delete process.env.SITE_PASSWORD
  })

  it('serves the landing page to a visitor with no session', async () => {
    const res = await proxy(request('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('serves the sample report to a visitor with no session', async () => {
    const res = await proxy(request('/sample'))
    expect(res.status).toBe(200)
  })

  it('still serves the login page itself', async () => {
    const res = await proxy(request('/login'))
    expect(res.status).toBe(200)
  })

  it('sends an unauthenticated visitor from /analyze to the login page', async () => {
    const res = await proxy(request('/analyze'))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/analyze')
  })

  it('keeps the route that spends money gated', async () => {
    const res = await proxy(request('/api/analyze'))
    expect(res.status).toBe(401)
  })

  it('keeps stored reports gated', async () => {
    const res = await proxy(request('/report/abc123'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('lets a valid session through to /analyze', async () => {
    const res = await proxy(request('/analyze', await issueSession(PASSWORD)))
    expect(res.status).toBe(200)
  })

  it('does not treat a path merely prefixed with a public path as public', async () => {
    const res = await proxy(request('/sample-not-really'))
    expect(res.status).toBe(307)
  })

  it('leaves everything open when no password is configured', async () => {
    delete process.env.SITE_PASSWORD
    const res = await proxy(request('/analyze'))
    expect(res.status).toBe(200)
  })
})
