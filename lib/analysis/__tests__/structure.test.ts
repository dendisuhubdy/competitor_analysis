import { describe, it, expect, vi } from 'vitest'
import { structureReport } from '@/lib/analysis/structure'
import { RefusalError } from '@/lib/claude'
import type { Report } from '@/lib/analysis/schema'

const source = { title: 'TechCrunch', url: 'https://tc.com/x' }

function comp(company: string) {
  return {
    company,
    roundStage: 'Seed',
    date: '2025-06-01',
    amountRaised: 4_000_000,
    postMoneyValuation: 20_000_000,
    revenueMultiple: null,
    source,
  }
}

function validReport(): Report {
  return {
    company: { name: 'Acme', oneLiner: 'x', category: 'y', inferredStage: 'seed' },
    competitors: [],
    positioning: {
      xAxis: { label: 'a', lowLabel: 'l', highLabel: 'h' },
      yAxis: { label: 'b', lowLabel: 'l', highLabel: 'h' },
      points: [{ name: 'Acme', x: 50, y: 50, isYou: true }],
      rationale: 'r',
    },
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    moat: { verdict: 'none', reasoning: 'r', defensibilityFactors: [] },
    gaps: [],
    wedge: { recommendation: 'r', rationale: 'r', firstMove: 'f', risks: [] },
    valuation: {
      comparables: [],
      impliedRange: null,
      fundraiseGuidance: {
        suggestedRaise: '$2M',
        suggestedStage: 'seed',
        keyMetricsToHit: [],
      },
      caveats: [],
    },
    sources: [source],
    confidence: 'medium',
  }
}

function fakeClient(parsed: unknown, stop = 'end_turn', category?: string) {
  return {
    messages: {
      parse: vi.fn(async () => ({
        stop_reason: stop,
        stop_details: category ? { category, explanation: null } : null,
        parsed_output: parsed,
        usage: { input_tokens: 500, output_tokens: 900 },
      })),
    },
  }
}

describe('structureReport', () => {
  it('returns the validated report', async () => {
    const client = fakeClient(validReport())
    const r = await structureReport({
      description: 'x',
      notes: 'n',
      truncated: false,
      client: client as never,
    })
    expect(r.report.company.name).toBe('Acme')
    expect(r.usage.outputTokens).toBe(900)
  })

  it('throws RefusalError before touching parsed_output', async () => {
    const client = fakeClient(null, 'refusal', 'cyber')
    await expect(
      structureReport({
        description: 'x',
        notes: 'n',
        truncated: false,
        client: client as never,
      }),
    ).rejects.toBeInstanceOf(RefusalError)
  })

  it('throws a clear error when parsed_output is null', async () => {
    const client = fakeClient(null)
    await expect(
      structureReport({
        description: 'x',
        notes: 'n',
        truncated: false,
        client: client as never,
      }),
    ).rejects.toThrow(/did not return/i)
  })

  it('applies the valuation integrity rule to the model output', async () => {
    const bad = validReport()
    bad.valuation.comparables = [comp('A'), comp('B')]
    bad.valuation.impliedRange = {
      low: 10,
      mid: 20,
      high: 30,
      currency: 'USD',
      basis: 'two comps',
    }
    const client = fakeClient(bad)
    const r = await structureReport({
      description: 'x',
      notes: 'n',
      truncated: false,
      client: client as never,
    })
    // The model tried to publish a range off two comps. We strip it.
    expect(r.report.valuation.impliedRange).toBeNull()
    expect(r.report.valuation.caveats.length).toBeGreaterThan(0)
  })

  it('forces confidence to low when research was truncated', async () => {
    const client = fakeClient({ ...validReport(), confidence: 'high' })
    const r = await structureReport({
      description: 'x',
      notes: 'n',
      truncated: true,
      client: client as never,
    })
    expect(r.report.confidence).toBe('low')
  })
})
