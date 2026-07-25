import { countRateLimitHits, recordRateLimitHit } from '@/lib/db'

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

/**
 * Read at call time, not module load, so tests and deploys can change it
 * without a restart.
 */
export function rateLimitMax(): number {
  const raw = Number(process.env.RATE_LIMIT_MAX)
  return Number.isFinite(raw) && raw > 0 ? raw : 5
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * The API key is server-side and every run costs real money, so this is not
 * optional. Records the hit only when the request is allowed.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const max = rateLimitMax()
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS
  const used = countRateLimitHits(ip, windowStart)
  const allowed = used < max

  if (allowed) recordRateLimitHit(ip)

  return {
    allowed,
    remaining: Math.max(0, max - used - (allowed ? 1 : 0)),
    resetAt: Date.now() + RATE_LIMIT_WINDOW_MS,
  }
}
