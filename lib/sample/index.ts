import { ReportSchema, type Report } from '@/lib/analysis/schema'
import raw from './report.json'

/**
 * A real completed run, rendered on the public landing page and at `/sample`.
 *
 * This is `parse`, not a cast, on purpose. The fixture is a snapshot of what
 * the product produced on 2026-07-25; if `ReportSchema` later changes shape,
 * parsing throws at import and the build fails. The alternative — casting —
 * would leave the public page quietly advertising output the product no longer
 * produces, which is the exact failure this page exists to disprove.
 *
 * The subject is the hypothetical company from the analyze form's own example
 * text, so nothing here is confidential.
 */
export const sampleReport: Report = ReportSchema.parse(raw)

const comparables = sampleReport.valuation.comparables
const withValuation = comparables.filter((c) => c.postMoneyValuation !== null)

/**
 * Every figure the landing page quotes is counted from the payload above.
 * Typing these in as literals would let the copy drift from the evidence —
 * on a page whose entire argument is that the numbers are checkable.
 */
export const sampleStats = {
  sources: sampleReport.sources.length,
  competitors: sampleReport.competitors.length,
  comparables: comparables.length,
  comparablesWithDisclosedValuation: withValuation.length,
  comparablesWithoutDisclosedValuation: comparables.length - withValuation.length,
  hasImpliedRange: sampleReport.valuation.impliedRange !== null,
}

/** The report explaining, in its own words, why it reports no range. */
export const SAMPLE_LEAD_CAVEAT: string = sampleReport.valuation.caveats[0] ?? ''
