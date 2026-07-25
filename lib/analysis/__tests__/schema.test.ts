import { describe, it, expect } from 'vitest'
import {
  ReportSchema,
  enforceValuationIntegrity,
  MIN_COMPARABLES_FOR_RANGE,
  type Report,
} from '@/lib/analysis/schema'

const source = { title: 'Crunchbase', url: 'https://example.com/a' }

function comparable(company: string) {
  return {
    company,
    roundStage: 'Series A',
    date: '2025-03-01',
    amountRaised: 12_000_000,
    postMoneyValuation: 60_000_000,
    revenueMultiple: null,
    source,
  }
}

function baseReport(overrides: Partial<Report> = {}): Report {
  return {
    company: {
      name: 'Acme',
      oneLiner: 'AI notetaker',
      category: 'productivity',
      inferredStage: 'seed',
    },
    competitors: [
      {
        name: 'Rival',
        url: 'https://rival.com',
        oneLiner: 'Also an AI notetaker',
        category: 'direct',
        overlapScore: 80,
        funding: null,
        pricing: null,
        targetSegment: 'SMB',
        strengths: ['brand'],
        weaknesses: ['price'],
        sources: [source],
      },
    ],
    positioning: {
      xAxis: { label: 'Price', lowLabel: 'Cheap', highLabel: 'Premium' },
      yAxis: { label: 'Depth', lowLabel: 'Shallow', highLabel: 'Deep' },
      points: [
        { name: 'Acme', x: 40, y: 70, isYou: true },
        { name: 'Rival', x: 70, y: 50, isYou: false },
      ],
      rationale: 'Price and depth separate this market.',
    },
    swot: {
      strengths: ['fast'],
      weaknesses: ['unknown'],
      opportunities: ['enterprise'],
      threats: ['incumbents'],
    },
    moat: { verdict: 'weak', reasoning: 'No data advantage.', defensibilityFactors: [] },
    gaps: [
      {
        segment: 'legal',
        unmetNeed: 'citation-grade accuracy',
        whyUnserved: 'too niche for horizontal tools',
        evidence: 'no vendor advertises it',
      },
    ],
    wedge: {
      recommendation: 'Start with legal.',
      rationale: 'Highest willingness to pay.',
      firstMove: 'Ship citation export.',
      risks: ['long sales cycles'],
    },
    valuation: {
      comparables: [],
      impliedRange: null,
      fundraiseGuidance: {
        suggestedRaise: '$3M',
        suggestedStage: 'seed',
        keyMetricsToHit: ['$50k MRR'],
      },
      caveats: [],
    },
    sources: [source],
    confidence: 'medium',
    ...overrides,
  }
}

describe('ReportSchema', () => {
  it('accepts a well-formed report', () => {
    expect(() => ReportSchema.parse(baseReport())).not.toThrow()
  })

  it('rejects a comparable with no source', () => {
    const bad = baseReport()
    const { source: _omit, ...noSource } = comparable('X')
    bad.valuation.comparables = [noSource as never]
    expect(() => ReportSchema.parse(bad)).toThrow()
  })

  it('accepts a comparable whose numeric fields are all null', () => {
    const r = baseReport()
    r.valuation.comparables = [
      {
        company: 'X',
        roundStage: 'Seed',
        date: '2025-01-01',
        amountRaised: null,
        postMoneyValuation: null,
        revenueMultiple: null,
        source,
      },
    ]
    expect(() => ReportSchema.parse(r)).not.toThrow()
  })

  it('rejects an unknown moat verdict', () => {
    const r = baseReport()
    ;(r.moat as { verdict: string }).verdict = 'bulletproof'
    expect(() => ReportSchema.parse(r)).toThrow()
  })
})

describe('enforceValuationIntegrity', () => {
  it('nulls impliedRange when there are too few comparables', () => {
    const r = baseReport()
    r.valuation.comparables = [comparable('A'), comparable('B')]
    r.valuation.impliedRange = {
      low: 1,
      mid: 2,
      high: 3,
      currency: 'USD',
      basis: 'comps',
    }
    const out = enforceValuationIntegrity(r)
    expect(out.valuation.impliedRange).toBeNull()
    expect(out.valuation.caveats.join(' ')).toContain(
      String(MIN_COMPARABLES_FOR_RANGE),
    )
  })

  it('keeps impliedRange at the threshold', () => {
    const r = baseReport()
    r.valuation.comparables = [comparable('A'), comparable('B'), comparable('C')]
    r.valuation.impliedRange = {
      low: 1,
      mid: 2,
      high: 3,
      currency: 'USD',
      basis: 'comps',
    }
    expect(enforceValuationIntegrity(r).valuation.impliedRange).not.toBeNull()
  })

  it('drops comparables whose source url is blank', () => {
    const r = baseReport()
    const blank = comparable('Ghost')
    blank.source = { title: 'x', url: '   ' }
    r.valuation.comparables = [comparable('A'), comparable('B'), blank]
    const out = enforceValuationIntegrity(r)
    expect(out.valuation.comparables.map((c) => c.company)).not.toContain('Ghost')
    expect(out.valuation.impliedRange).toBeNull()
  })
})
