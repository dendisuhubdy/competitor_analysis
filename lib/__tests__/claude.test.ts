import { describe, it, expect, afterEach } from 'vitest'
import {
  assertNotRefused,
  RefusalError,
  WEB_TOOLS,
  MODEL,
  resolveApiKey,
} from '@/lib/claude'
import { researchPrompt, structuringPrompt } from '@/lib/analysis/prompts'

describe('assertNotRefused', () => {
  it('passes through a normal stop reason', () => {
    expect(() =>
      assertNotRefused({ stop_reason: 'end_turn', stop_details: null }),
    ).not.toThrow()
  })

  it('throws RefusalError carrying the category', () => {
    try {
      assertNotRefused({
        stop_reason: 'refusal',
        stop_details: { category: 'cyber', explanation: 'nope' },
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RefusalError)
      expect((e as RefusalError).category).toBe('cyber')
    }
  })

  it('tolerates a null stop_details on a refusal', () => {
    expect(() =>
      assertNotRefused({ stop_reason: 'refusal', stop_details: null }),
    ).toThrow(RefusalError)
  })
})

describe('resolveApiKey', () => {
  const saved = {
    lobster: process.env.CLAUDE_MYLOBSTER_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
  }

  afterEach(() => {
    // Restore, since the real key may be present in this shell.
    if (saved.lobster === undefined) delete process.env.CLAUDE_MYLOBSTER_KEY
    else process.env.CLAUDE_MYLOBSTER_KEY = saved.lobster
    if (saved.anthropic === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved.anthropic
  })

  it('prefers CLAUDE_MYLOBSTER_KEY over ANTHROPIC_API_KEY', () => {
    process.env.CLAUDE_MYLOBSTER_KEY = 'lobster'
    process.env.ANTHROPIC_API_KEY = 'anthropic'
    expect(resolveApiKey()).toBe('lobster')
  })

  it('falls back to ANTHROPIC_API_KEY', () => {
    delete process.env.CLAUDE_MYLOBSTER_KEY
    process.env.ANTHROPIC_API_KEY = 'anthropic'
    expect(resolveApiKey()).toBe('anthropic')
  })

  it('returns undefined when neither is set', () => {
    delete process.env.CLAUDE_MYLOBSTER_KEY
    delete process.env.ANTHROPIC_API_KEY
    expect(resolveApiKey()).toBeUndefined()
  })
})

describe('config', () => {
  it('pins Claude Opus 5', () => {
    expect(MODEL).toBe('claude-opus-5')
  })

  it('declares only the two web tools, never code execution', () => {
    const types = WEB_TOOLS.map((t) => t.type)
    expect(types).toEqual(['web_search_20260209', 'web_fetch_20260209'])
    expect(types.some((t) => t.startsWith('code_execution'))).toBe(false)
  })
})

describe('prompts', () => {
  it('embeds the description in the research prompt', () => {
    expect(researchPrompt('AI notetaker for lawyers')).toContain(
      'AI notetaker for lawyers',
    )
  })

  it('states the sourcing rule for valuation comparables', () => {
    expect(researchPrompt('x').toLowerCase()).toContain('omit')
  })

  it('warns the structuring pass when research was truncated', () => {
    expect(structuringPrompt('x', 'notes', true).toLowerCase()).toContain(
      'incomplete',
    )
    expect(structuringPrompt('x', 'notes', false).toLowerCase()).not.toContain(
      'incomplete',
    )
  })
})
