import { describe, it, expect } from 'vitest'
import { ReportSchema } from '@/lib/analysis/schema'
import { sampleReport, sampleStats, SAMPLE_LEAD_CAVEAT } from '@/lib/sample'

describe('sample report fixture', () => {
  it('satisfies the current ReportSchema', () => {
    expect(() => ReportSchema.parse(sampleReport)).not.toThrow()
  })

  it('derives its statistics from the payload rather than hardcoding them', () => {
    expect(sampleStats.sources).toBe(sampleReport.sources.length)
    expect(sampleStats.competitors).toBe(sampleReport.competitors.length)
    expect(sampleStats.comparables).toBe(sampleReport.valuation.comparables.length)
    expect(
      sampleStats.comparablesWithDisclosedValuation +
        sampleStats.comparablesWithoutDisclosedValuation,
    ).toBe(sampleStats.comparables)
  })

  it('is a report that withholds its valuation range, which is what it is here to demonstrate', () => {
    expect(sampleStats.hasImpliedRange).toBe(false)
    expect(sampleStats.comparables).toBeGreaterThan(0)
    expect(
      sampleReport.valuation.comparables.every((c) => c.source.url.length > 0),
    ).toBe(true)
  })

  it('exposes the report own leading caveat for quoting', () => {
    expect(SAMPLE_LEAD_CAVEAT).toBe(sampleReport.valuation.caveats[0])
    expect(SAMPLE_LEAD_CAVEAT.length).toBeGreaterThan(40)
  })
})
