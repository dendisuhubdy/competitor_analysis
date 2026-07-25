import { describe, it, expect, vi } from 'vitest'
import { runResearch, MAX_CONTINUATIONS } from '@/lib/analysis/research'
import { RefusalError } from '@/lib/claude'

/** Build a fake message the way the SDK returns it. */
function message(opts: {
  stop?: string
  text?: string
  tools?: { name: string; input: Record<string, string> }[]
  refusalCategory?: string
}) {
  const content: Record<string, unknown>[] = []
  for (const t of opts.tools ?? []) {
    content.push({ type: 'server_tool_use', name: t.name, input: t.input })
  }
  if (opts.text) content.push({ type: 'text', text: opts.text })
  return {
    stop_reason: opts.stop ?? 'end_turn',
    stop_details: opts.refusalCategory
      ? { category: opts.refusalCategory, explanation: 'no' }
      : null,
    content,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

/** Minimal stand-in for client.beta.messages.stream(). */
function fakeClient(messages: ReturnType<typeof message>[]) {
  let call = 0
  const seen: unknown[][] = []
  return {
    calls: seen,
    beta: {
      messages: {
        stream: (params: { messages: unknown[] }) => {
          // Snapshot, don't alias — runResearch mutates the same array to
          // append the paused assistant turn, so storing the reference would
          // make every recorded call look identical.
          seen.push([...params.messages])
          const msg = messages[Math.min(call++, messages.length - 1)]
          return {
            finalMessage: async () => msg,
            on: () => {},
          }
        },
      },
    },
  }
}

describe('runResearch', () => {
  it('returns the assembled notes on a clean run', async () => {
    const client = fakeClient([message({ text: 'Rival raised $12M.' })])
    const r = await runResearch({
      description: 'ai notetaker',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.notes).toContain('Rival raised $12M.')
    expect(r.truncated).toBe(false)
  })

  it('resumes on pause_turn and concatenates both turns', async () => {
    const client = fakeClient([
      message({ stop: 'pause_turn', text: 'part one.' }),
      message({ stop: 'end_turn', text: 'part two.' }),
    ])
    const r = await runResearch({
      description: 'x',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.notes).toContain('part one.')
    expect(r.notes).toContain('part two.')
    expect(r.truncated).toBe(false)
    // Second request must carry the paused assistant turn back.
    expect(client.calls[1].length).toBeGreaterThan(client.calls[0].length)
  })

  it('stops at the continuation cap and marks the result truncated', async () => {
    const client = fakeClient([message({ stop: 'pause_turn', text: 'more.' })])
    const r = await runResearch({
      description: 'x',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.truncated).toBe(true)
    expect(client.calls.length).toBe(MAX_CONTINUATIONS + 1)
  })

  it('throws RefusalError without reading content', async () => {
    const client = fakeClient([
      message({ stop: 'refusal', refusalCategory: 'cyber' }),
    ])
    await expect(
      runResearch({
        description: 'x',
        onProgress: () => {},
        client: client as never,
      }),
    ).rejects.toBeInstanceOf(RefusalError)
  })

  it('emits a search progress step carrying the real query', async () => {
    const client = fakeClient([
      message({
        text: 'done',
        tools: [{ name: 'web_search', input: { query: 'rival pricing 2026' } }],
      }),
    ])
    const onProgress = vi.fn()
    await runResearch({
      description: 'x',
      onProgress,
      client: client as never,
    })
    expect(onProgress).toHaveBeenCalledWith('search', 'rival pricing 2026')
  })

  it('emits a fetch progress step carrying the real url', async () => {
    const client = fakeClient([
      message({
        text: 'done',
        tools: [{ name: 'web_fetch', input: { url: 'https://rival.com/pricing' } }],
      }),
    ])
    const onProgress = vi.fn()
    await runResearch({ description: 'x', onProgress, client: client as never })
    expect(onProgress).toHaveBeenCalledWith('fetch', 'https://rival.com/pricing')
  })

  it('counts web searches in the usage summary', async () => {
    const client = fakeClient([
      message({
        text: 'done',
        tools: [
          { name: 'web_search', input: { query: 'a' } },
          { name: 'web_search', input: { query: 'b' } },
        ],
      }),
    ])
    const r = await runResearch({
      description: 'x',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.usage.webSearches).toBe(2)
  })
})
