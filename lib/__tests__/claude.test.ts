import { describe, it, expect } from 'vitest'
import { assertNotRefused, RefusalError, WEB_TOOLS, MODEL } from '@/lib/claude'
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
