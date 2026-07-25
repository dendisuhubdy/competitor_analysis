import {
  getClient,
  MODEL,
  WEB_TOOLS,
  FALLBACK_BETA,
  assertNotRefused,
} from '@/lib/claude'
import { RESEARCH_SYSTEM, researchPrompt } from '@/lib/analysis/prompts'
import { emptyUsage, addUsage, type UsageSummary } from '@/lib/cost'

/**
 * Server-tool loops stop at the server-side iteration limit with
 * `stop_reason: "pause_turn"`. We append the paused assistant turn and
 * re-send to resume. Capped so a pathological run cannot spin forever.
 */
export const MAX_CONTINUATIONS = 5

export interface ResearchResult {
  notes: string
  usage: UsageSummary
  /** True if we hit MAX_CONTINUATIONS — the caller should degrade confidence. */
  truncated: boolean
}

export type ProgressFn = (
  kind: 'search' | 'fetch' | 'thinking',
  detail: string,
) => void

/** Structural type so tests can inject a stub without the whole SDK. */
interface MinimalClient {
  beta: {
    messages: {
      stream: (params: Record<string, unknown>) => {
        finalMessage: () => Promise<Record<string, unknown>>
        on?: (
          event: string,
          cb: (block: Record<string, unknown>) => void,
        ) => void
      }
    }
  }
}

export async function runResearch(opts: {
  description: string
  onProgress: ProgressFn
  client?: MinimalClient
}): Promise<ResearchResult> {
  const client = (opts.client ?? getClient()) as unknown as MinimalClient
  const messages: Record<string, unknown>[] = [
    { role: 'user', content: researchPrompt(opts.description) },
  ]

  let usage = emptyUsage()
  let notes = ''
  let truncated = false

  // The model repeats queries across resumed turns; dedupe here so a caller
  // that persists every event does not show the same search twice.
  const emitted = new Set<string>()
  const emit: ProgressFn = (kind, detail) => {
    const key = `${kind}:${detail}`
    if (emitted.has(key)) return
    emitted.add(key)
    opts.onProgress(kind, detail)
  }

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      // Streaming is mandatory above ~16k max_tokens or the SDK times out.
      max_tokens: 64000,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
      system: RESEARCH_SYSTEM,
      tools: WEB_TOOLS,
      betas: [FALLBACK_BETA],
      // Routes refusals to a fallback model by category rather than pinning
      // a specific model. Natively typed as Array<BetaFallbackParam> | 'default'.
      fallbacks: 'default',
      messages,
    })

    // Live progress: `contentBlock` fires with each fully-accumulated block,
    // so the user sees each search as it happens rather than at turn end.
    stream.on?.('contentBlock', (block) => emitProgress(block, emit))

    const msg = await stream.finalMessage()

    // MUST come before reading content — a refusal is a 200 with no content.
    assertNotRefused(msg as { stop_reason: string | null })

    const content = (msg.content ?? []) as Record<string, unknown>[]

    let searches = 0
    for (const block of content) {
      if (block.type !== 'server_tool_use') continue
      if (block.name === 'web_search') searches++
      // Backstop for a stream that did not deliver contentBlock events.
      // `emit` dedupes, so overlapping with the live handler is harmless.
      emitProgress(block, emit)
    }

    usage = addUsage(usage, (msg.usage ?? {}) as Record<string, number>, searches)
    notes += textOf(content)

    if (msg.stop_reason !== 'pause_turn') {
      return { notes: notes.trim(), usage, truncated: false }
    }

    if (attempt === MAX_CONTINUATIONS) {
      truncated = true
      break
    }

    // Resume: append the paused assistant turn verbatim and re-send.
    messages.push({ role: 'assistant', content })
  }

  return { notes: notes.trim(), usage, truncated }
}

function emitProgress(block: Record<string, unknown>, onProgress: ProgressFn) {
  if (block.type !== 'server_tool_use') return
  const input = (block.input ?? {}) as Record<string, string>
  if (block.name === 'web_search' && input.query) {
    onProgress('search', input.query)
  } else if (block.name === 'web_fetch' && input.url) {
    onProgress('fetch', input.url)
  }
}

function textOf(content: Record<string, unknown>[]): string {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text as string)
    .join('\n')
}
