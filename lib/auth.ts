/**
 * Shared-password gate for the whole site.
 *
 * Every analysis run costs real money, so the deployed app is not open to the
 * internet. This is deliberately the simplest thing that bounds spend: one
 * password, handed to whoever should have access.
 *
 * Uses Web Crypto only — no Node built-ins — because this module is imported by
 * `proxy.ts`, which the Next.js docs describe as running separately from the
 * app and potentially outside its main runtime. Everything here is a pure
 * function over its arguments for the same reason: no shared state, no globals.
 */

export const SESSION_COOKIE = 'ca_session'

/** Seven days. Long enough not to nag, short enough that a leaked cookie dies. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/**
 * The configured password, or `undefined` when unset. An unset password means
 * the gate is disabled — convenient for local dev, and the reason the deploy
 * checklist treats setting it as mandatory.
 */
export function sitePassword(): string | undefined {
  const raw = process.env.SITE_PASSWORD
  if (typeof raw !== 'string') return undefined
  return raw.trim().length > 0 ? raw : undefined
}

const encoder = new TextEncoder()

async function sign(issuedAt: number, password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`v1.${issuedAt}`),
  )
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Comparison whose duration does not depend on where the first difference is. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * `<issuedAt>.<hmac>`. The timestamp is covered by the signature, so a holder
 * cannot re-date a token to extend its own session.
 */
export async function issueSession(
  password: string,
  issuedAt: number = Date.now(),
): Promise<string> {
  return `${issuedAt}.${await sign(issuedAt, password)}`
}

export async function verifySession(
  token: string | undefined,
  password: string | undefined,
): Promise<boolean> {
  if (!token || !password) return false

  const parts = token.split('.')
  if (parts.length !== 2) return false

  const [rawIssuedAt, signature] = parts
  if (!rawIssuedAt || !signature) return false

  const issuedAt = Number(rawIssuedAt)
  if (!Number.isSafeInteger(issuedAt)) return false

  const age = Date.now() - issuedAt
  // Reject the future as well as the distant past: a clock-skewed or forged
  // forward-dated token should not outlive the window.
  if (age < 0 || age > SESSION_MAX_AGE_SECONDS * 1000) return false

  return constantTimeEquals(signature, await sign(issuedAt, password))
}
