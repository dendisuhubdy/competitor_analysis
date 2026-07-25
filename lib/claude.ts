import Anthropic from '@anthropic-ai/sdk'

/** Non-negotiable. Never substitute another model. */
export const MODEL = 'claude-opus-5'

/**
 * Server-side fallbacks. `"default"` routes by refusal category rather than
 * pinning a fallback model, so it needs no maintenance when models change.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/**
 * The `_20260209` variants have dynamic filtering built in — they run code
 * server-side under the hood. Do NOT additionally declare `code_execution`;
 * a second execution environment confuses the model.
 */
export const WEB_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 20 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 15 },
] as const

let client: Anthropic | null = null

/**
 * `CLAUDE_MYLOBSTER_KEY` is this project's primary key and wins;
 * `ANTHROPIC_API_KEY` (the SDK's own convention) is the fallback.
 *
 * The key is passed to the constructor explicitly rather than left to the
 * SDK's implicit env lookup — otherwise a stray `ANTHROPIC_API_KEY` in the
 * environment would silently take over, which is exactly the precedence we
 * are overriding here.
 */
export function resolveApiKey(): string | undefined {
  return process.env.CLAUDE_MYLOBSTER_KEY || process.env.ANTHROPIC_API_KEY
}

/** Test-only: drop the memoized client so a new key takes effect. */
export function resetClientForTests(): void {
  client = null
}

/**
 * Server-only. Importing this module from a client component would leak the
 * API key into the browser bundle.
 */
export function getClient(): Anthropic {
  if (!client) {
    const apiKey = resolveApiKey()
    if (!apiKey) {
      throw new Error(
        'No API key found. Set ANTHROPIC_API_KEY or CLAUDE_MYLOBSTER_KEY.',
      )
    }
    client = new Anthropic({ apiKey })
  }
  return client
}

export class RefusalError extends Error {
  readonly category: string | null
  constructor(category: string | null, explanation?: string | null) {
    super(
      `Claude declined this request${category ? ` (${category})` : ''}` +
        `${explanation ? `: ${explanation}` : ''}`,
    )
    this.name = 'RefusalError'
    this.category = category
  }
}

interface StopShape {
  stop_reason: string | null
  stop_details?: { category?: string | null; explanation?: string | null } | null
}

/**
 * Call this BEFORE reading `message.content`. A refusal is an HTTP 200 with
 * empty or partial content — indexing `content[0]` blind will crash.
 * `stop_details` may be null even on a refusal, so never branch on it.
 */
export function assertNotRefused(msg: StopShape): void {
  if (msg.stop_reason !== 'refusal') return
  throw new RefusalError(
    msg.stop_details?.category ?? null,
    msg.stop_details?.explanation ?? null,
  )
}
