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

/**
 * Phase 2 makes one schema-constrained call per report section, so the stub
 * hands back only that section's keys on each successive call — the same shape
 * the real API returns. If `structureReport` ever stopped merging the sections,
 * the final `ReportSchema.parse` would fail on the missing keys.
 */
function sectionsOf(report: Report): Record<string, unknown>[] {
  return [
    { company: report.company, competitors: report.competitors },
    {
      positioning: report.positioning,
      swot: report.swot,
      moat: report.moat,
      gaps: report.gaps,
      wedge: report.wedge,
    },
    {
      valuation: report.valuation,
      sources: report.sources,
      confidence: report.confidence,
    },
  ]
}

function fakeClient(parsed: unknown, stop = 'end_turn', category?: string) {
  // `null` means "the model returned nothing parseable" — keep it null on every
  // call rather than slicing it into sections.
  const outputs =
    parsed === null ? [null, null, null] : sectionsOf(parsed as Report)
  let call = 0
  return {
    messages: {
      parse: vi.fn(async () => ({
        stop_reason: stop,
        stop_details: category ? { category, explanation: null } : null,
        parsed_output: outputs[Math.min(call++, outputs.length - 1)],
        usage: { input_tokens: 500, output_tokens: 300 },
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
    // Usage accumulates across all three section calls.
    expect(r.usage.outputTokens).toBe(900)
  })

  it('merges three section calls into one report', async () => {
    const client = fakeClient(validReport())
    const r = await structureReport({
      description: 'x',
      notes: 'n',
      truncated: false,
      client: client as never,
    })

    expect(client.messages.parse).toHaveBeenCalledTimes(3)
    // Every section landed, not just the last call's keys.
    expect(r.report.company.name).toBe('Acme')
    expect(r.report.positioning.points).toHaveLength(1)
    expect(r.report.confidence).toBe('medium')
  })

  it('sends a distinct schema per call over an identical context prefix', async () => {
    const client = fakeClient(validReport())
    await structureReport({
      description: 'x',
      notes: 'the notes',
      truncated: false,
      client: client as never,
    })

    const calls = client.messages.parse.mock.calls.map(
      ([params]) => params as Record<string, never>,
    )

    // Each call constrains a different slice of the report.
    const schemas = calls.map((c) =>
      JSON.stringify((c.output_config as Record<string, unknown>).format),
    )
    expect(new Set(schemas).size).toBe(3)

    // Every call carries the same notes; only the trailing instruction varies.
    const prefixes = calls.map((c) => (c.messages as never[])[0])
    const first = prefixes.map(
      (m) => (m as { content: { text: string }[] }).content[0],
    )
    expect(new Set(first.map((b) => b.text)).size).toBe(1)
    expect(first[0].text).toContain('the notes')

    // No cache_control: output_config.format is part of the cached prefix, so
    // three different schemas can never share an entry. A breakpoint would add
    // the write premium to every call and never be read back. See structure.ts.
    for (const block of first) {
      expect(
        (block as unknown as Record<string, unknown>).cache_control,
      ).toBeUndefined()
    }

    // The instructions do differ, which is what makes each call a section.
    const instructions = prefixes.map(
      (m) => (m as { content: { text: string }[] }).content[1].text,
    )
    expect(new Set(instructions).size).toBe(3)
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
