import { describe, it, expect } from 'vitest'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sitePassword,
  issueSession,
  verifySession,
} from '@/lib/auth'

const SECRET = 'correct horse battery staple'

describe('sitePassword', () => {
  it('is undefined when unset, which callers must treat as "gate disabled"', () => {
    delete process.env.SITE_PASSWORD
    expect(sitePassword()).toBeUndefined()
  })

  it('ignores a blank or whitespace-only value', () => {
    process.env.SITE_PASSWORD = '   '
    expect(sitePassword()).toBeUndefined()
    delete process.env.SITE_PASSWORD
  })
})

describe('session tokens', () => {
  it('issues a token that verifies against the same password', async () => {
    const token = await issueSession(SECRET)
    expect(await verifySession(token, SECRET)).toBe(true)
  })

  it('rejects a token issued under a different password', async () => {
    const token = await issueSession(SECRET)
    expect(await verifySession(token, 'wrong password')).toBe(false)
  })

  it('rejects a tampered signature', async () => {
    const token = await issueSession(SECRET)
    const [issuedAt, sig] = token.split('.')
    const flipped = sig.startsWith('0') ? `1${sig.slice(1)}` : `0${sig.slice(1)}`
    expect(await verifySession(`${issuedAt}.${flipped}`, SECRET)).toBe(false)
  })

  it('rejects a token whose timestamp was moved to extend its life', async () => {
    // The timestamp is signed, so re-dating a token invalidates it rather than
    // buying the holder a fresh window. Both timestamps are inside the validity
    // window and explicitly distinct — issuing twice in the same millisecond
    // would produce an identical (and legitimately valid) token.
    const token = await issueSession(SECRET, Date.now() - 60_000)
    const sig = token.split('.')[1]
    expect(await verifySession(`${Date.now() - 1_000}.${sig}`, SECRET)).toBe(
      false,
    )
  })

  it('rejects an expired token', async () => {
    const stale = Date.now() - (SESSION_MAX_AGE_SECONDS + 60) * 1000
    const token = await issueSession(SECRET, stale)
    expect(await verifySession(token, SECRET)).toBe(false)
  })

  it('rejects malformed input without throwing', async () => {
    for (const bad of ['', 'nonsense', 'a.b.c', '.', 'abc.', '.abc']) {
      expect(await verifySession(bad, SECRET)).toBe(false)
    }
  })

  it('rejects a token when no password is configured', async () => {
    const token = await issueSession(SECRET)
    expect(await verifySession(token, undefined)).toBe(false)
  })
})
