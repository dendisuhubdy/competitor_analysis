import { z } from 'zod'

/**
 * Single source of truth for the report payload. This schema generates the
 * JSON schema sent to Claude AND types every dashboard component.
 *
 * Structured outputs do not support numeric/string constraints (`min`, `max`,
 * `length`). Declaring them here is safe — the SDK strips them from the JSON
 * schema sent to Claude and validates them client-side.
 */

export const MIN_COMPARABLES_FOR_RANGE = 3

export const SourceSchema = z.object({
  title: z.string(),
  url: z.string(),
})

export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string(),
  oneLiner: z.string(),
  category: z.enum(['direct', 'adjacent', 'emerging']),
  overlapScore: z.number(),
  funding: z
    .object({
      totalRaised: z.string().nullable(),
      lastRound: z.string().nullable(),
      lastRoundDate: z.string().nullable(),
      investors: z.array(z.string()),
    })
    .nullable(),
  pricing: z
    .object({
      model: z.string(),
      entryPrice: z.string().nullable(),
      notes: z.string(),
    })
    .nullable(),
  targetSegment: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  sources: z.array(SourceSchema),
})

export const PositioningSchema = z.object({
  xAxis: z.object({ label: z.string(), lowLabel: z.string(), highLabel: z.string() }),
  yAxis: z.object({ label: z.string(), lowLabel: z.string(), highLabel: z.string() }),
  points: z.array(
    z.object({
      name: z.string(),
      x: z.number(),
      y: z.number(),
      isYou: z.boolean(),
    }),
  ),
  rationale: z.string(),
})

export const SwotSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  threats: z.array(z.string()),
})

export const MoatSchema = z.object({
  verdict: z.enum(['strong', 'emerging', 'weak', 'none']),
  reasoning: z.string(),
  defensibilityFactors: z.array(z.string()),
})

export const GapSchema = z.object({
  segment: z.string(),
  unmetNeed: z.string(),
  whyUnserved: z.string(),
  evidence: z.string(),
})

export const WedgeSchema = z.object({
  recommendation: z.string(),
  rationale: z.string(),
  firstMove: z.string(),
  risks: z.array(z.string()),
})

/**
 * `source` is REQUIRED and non-nullable while every numeric field is nullable.
 * That asymmetry is the point: the model must omit a comparable it cannot
 * source rather than invent numbers for it.
 */
export const ComparableSchema = z.object({
  company: z.string(),
  roundStage: z.string(),
  date: z.string(),
  amountRaised: z.number().nullable(),
  postMoneyValuation: z.number().nullable(),
  revenueMultiple: z.number().nullable(),
  source: SourceSchema,
})

export const ValuationSchema = z.object({
  comparables: z.array(ComparableSchema),
  impliedRange: z
    .object({
      low: z.number(),
      mid: z.number(),
      high: z.number(),
      currency: z.string(),
      basis: z.string(),
    })
    .nullable(),
  fundraiseGuidance: z.object({
    suggestedRaise: z.string(),
    suggestedStage: z.string(),
    keyMetricsToHit: z.array(z.string()),
  }),
  caveats: z.array(z.string()),
})

export const CompanySchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  category: z.string(),
  inferredStage: z.string(),
})

export const ReportSchema = z.object({
  company: CompanySchema,
  competitors: z.array(CompetitorSchema),
  positioning: PositioningSchema,
  swot: SwotSchema,
  moat: MoatSchema,
  gaps: z.array(GapSchema),
  wedge: WedgeSchema,
  valuation: ValuationSchema,
  sources: z.array(SourceSchema),
  confidence: z.enum(['high', 'medium', 'low']),
})

/**
 * Structured outputs compile the JSON schema into a grammar server-side, and
 * that grammar has a size limit `ReportSchema` exceeds — the whole report in one
 * call returns 400 "The compiled grammar is too large". Measured against the
 * live API: a schema of ~60 leaf properties compiles, ~100 does not, and
 * `ReportSchema` sits above the line. Nesting is cheap; it is the *count* of
 * leaf properties that costs. (Union types — every `.nullable()` — are governed
 * by a separate, stricter "too many parameters with union types" limit, so keep
 * nullable fields sparse within any one section.)
 *
 * So phase 2 runs one schema-constrained call per section and merges the
 * results. These three partition `ReportSchema` exactly: every key appears in
 * exactly one section, and `REPORT_SECTIONS` is type-checked against `Report`
 * below so a new field cannot be added to the report without being assigned to
 * a section.
 */
export const LandscapeSectionSchema = z.object({
  company: CompanySchema,
  competitors: z.array(CompetitorSchema),
})

export const StrategySectionSchema = z.object({
  positioning: PositioningSchema,
  swot: SwotSchema,
  moat: MoatSchema,
  gaps: z.array(GapSchema),
  wedge: WedgeSchema,
})

export const ValuationSectionSchema = z.object({
  valuation: ValuationSchema,
  sources: z.array(SourceSchema),
  confidence: z.enum(['high', 'medium', 'low']),
})

export type Source = z.infer<typeof SourceSchema>
export type Competitor = z.infer<typeof CompetitorSchema>
export type Positioning = z.infer<typeof PositioningSchema>
export type Swot = z.infer<typeof SwotSchema>
export type Moat = z.infer<typeof MoatSchema>
export type Gap = z.infer<typeof GapSchema>
export type Wedge = z.infer<typeof WedgeSchema>
export type Comparable = z.infer<typeof ComparableSchema>
export type Valuation = z.infer<typeof ValuationSchema>
export type Report = z.infer<typeof ReportSchema>

export type LandscapeSection = z.infer<typeof LandscapeSectionSchema>
export type StrategySection = z.infer<typeof StrategySectionSchema>
export type ValuationSection = z.infer<typeof ValuationSectionSchema>

/**
 * Compile-time proof that the three sections partition `Report` exactly — their
 * union is assignable to `Report` and vice versa. Add a field to `ReportSchema`
 * without putting it in a section and this stops compiling, which is the point:
 * a silently unassigned field would be missing from every structuring call and
 * only surface as a Zod failure at runtime, after paying for the research.
 */
type SectionUnion = LandscapeSection & StrategySection & ValuationSection
const _sectionsPartitionReport: SectionUnion extends Report
  ? Report extends SectionUnion
    ? true
    : never
  : never = true
void _sectionsPartitionReport

/**
 * Belt-and-braces enforcement of the valuation integrity rules. The schema
 * already rejects a comparable with no `source` object, but a blank URL passes
 * type validation while being useless as evidence — so drop those too, then
 * re-check the threshold.
 */
export function enforceValuationIntegrity(report: Report): Report {
  const sourced = report.valuation.comparables.filter(
    (c) => c.source.url.trim().length > 0,
  )
  const enough = sourced.length >= MIN_COMPARABLES_FOR_RANGE
  const caveats = [...report.valuation.caveats]

  if (!enough && report.valuation.impliedRange !== null) {
    caveats.push(
      `Only ${sourced.length} sourced comparable(s) were found; ` +
        `at least ${MIN_COMPARABLES_FOR_RANGE} are required before an implied ` +
        `valuation range is reported.`,
    )
  }

  return {
    ...report,
    valuation: {
      ...report.valuation,
      comparables: sourced,
      impliedRange: enough ? report.valuation.impliedRange : null,
      caveats,
    },
  }
}
