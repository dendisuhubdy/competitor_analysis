import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  countRateLimitHits: vi.fn(),
  recordRateLimitHit: vi.fn(),
}))

import { countRateLimitHits, recordRateLimitHit } from '@/lib/db'
import { checkRateLimit } from '@/lib/ratelimit'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RATE_LIMIT_MAX = '3'
})

describe('checkRateLimit', () => {
  it('allows and records when under the limit', () => {
    vi.mocked(countRateLimitHits).mockReturnValue(1)
    const r = checkRateLimit('1.1.1.1')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(1)
    expect(recordRateLimitHit).toHaveBeenCalledWith('1.1.1.1')
  })

  it('blocks at the limit and does not record', () => {
    vi.mocked(countRateLimitHits).mockReturnValue(3)
    const r = checkRateLimit('1.1.1.1')
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(recordRateLimitHit).not.toHaveBeenCalled()
  })

  it('never reports negative remaining', () => {
    vi.mocked(countRateLimitHits).mockReturnValue(99)
    expect(checkRateLimit('1.1.1.1').remaining).toBe(0)
  })
})
