import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { getClient, MODEL, assertNotRefused } from '@/lib/claude'
import {
  ReportSchema,
  LandscapeSectionSchema,
  StrategySectionSchema,
  ValuationSectionSchema,
  enforceValuationIntegrity,
  type Report,
} from '@/lib/analysis/schema'
import {
  STRUCTURING_SYSTEM,
  structuringPrompt,
  SECTION_INSTRUCTIONS,
} from '@/lib/analysis/prompts'
import { emptyUsage, addUsage, type UsageSummary } from '@/lib/cost'

export interface StructureResult {
  report: Report
  usage: UsageSummary
}

interface MinimalClient {
  messages: {
    parse: (params: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

/**
 * The three calls that make up phase 2, in the order they run. Each is
 * schema-constrained on its own slice of the report; merging the three yields a
 * whole `Report`, which is then validated against `ReportSchema`.
 */
const SECTIONS = [
  { key: 'landscape', schema: LandscapeSectionSchema },
  { key: 'strategy', schema: StrategySectionSchema },
  { key: 'valuation', schema: ValuationSectionSchema },
] as const satisfies ReadonlyArray<{
  key: keyof typeof SECTION_INSTRUCTIONS
  schema: z.ZodType
}>

/**
 * Phase 2 reshapes phase 1's notes into the strict payload. It declares no
 * tools, so it is fast and cheap relative to research.
 *
 * It runs as THREE schema-constrained calls rather than one. The whole
 * `ReportSchema` exceeds the structured-output grammar limit and returns 400
 * "The compiled grammar is too large" — see the note on the section schemas in
 * `schema.ts` for the measured boundary.
 *
 * NO PROMPT CACHING HERE, deliberately. The obvious optimisation is to put the
 * research notes behind a `cache_control` breakpoint so calls 2 and 3 read them
 * back rather than re-billing the largest input three times. It does not work:
 * `output_config.format` participates in the cached prefix, so three calls with
 * three different schemas produce three different cache entries. Measured
 * against the live API: two calls with the same schema and an identical text
 * prefix hit (write=3381 → read=3381); changing only the schema missed and paid
 * a fresh write. A breakpoint here would add the 1.25x write premium to every
 * call and never once be read.
 *
 * DELIBERATE: no `fallbacks` here. Server-side fallbacks require the beta
 * messages endpoint, but `messages.parse()` — which validates the response
 * against the schema and retries the model on mismatch — is on the non-beta
 * path. These calls send no external web content and only reshape text that
 * phase 1 already produced, so their refusal risk is negligible. We still check
 * `stop_reason`.
 */
export async function structureReport(opts: {
  description: string
  notes: string
  truncated: boolean
  client?: MinimalClient
  onProgress?: (detail: string) => void
}): Promise<StructureResult> {
  const client = (opts.client ?? getClient()) as unknown as MinimalClient
  const context = structuringPrompt(opts.description, opts.notes, opts.truncated)

  let usage = emptyUsage()
  const merged: Record<string, unknown> = {}

  for (const section of SECTIONS) {
    opts.onProgress?.(section.key)

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(section.schema),
      },
      system: STRUCTURING_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: context },
            { type: 'text', text: SECTION_INSTRUCTIONS[section.key] },
          ],
        },
      ],
    })

    assertNotRefused(response as { stop_reason: string | null })

    if (!response.parsed_output) {
      throw new Error(
        `Structuring pass did not return a parsed ${section.key} section. ` +
          `stop_reason=${String(response.stop_reason)}`,
      )
    }

    Object.assign(merged, response.parsed_output)
    usage = addUsage(usage, (response.usage ?? {}) as Record<string, number>)
  }

  // Re-validate rather than trusting the SDK's parse blindly; this is the
  // boundary between model output and our type system, and it is also what
  // catches a section that came back structurally valid on its own but leaves
  // the merged report incomplete.
  let report = ReportSchema.parse(merged)

  // The model is instructed to obey the comparables threshold, but the rule is
  // enforced in code because a fabricated valuation range is the one output
  // here that could do real damage.
  report = enforceValuationIntegrity(report)

  if (opts.truncated) report = { ...report, confidence: 'low' }

  return { report, usage }
}
