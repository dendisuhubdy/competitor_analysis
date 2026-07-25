import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getClient, MODEL, assertNotRefused } from '@/lib/claude'
import {
  ReportSchema,
  enforceValuationIntegrity,
  type Report,
} from '@/lib/analysis/schema'
import { STRUCTURING_SYSTEM, structuringPrompt } from '@/lib/analysis/prompts'
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
 * Phase 2 reshapes phase 1's notes into the strict payload. It declares no
 * tools, so it is fast and cheap relative to research.
 *
 * DELIBERATE: no `fallbacks` here. Server-side fallbacks require the beta
 * messages endpoint, but `messages.parse()` — which validates the response
 * against the schema and retries the model on mismatch — is on the non-beta
 * path. This call sends no external web content and only reshapes text that
 * phase 1 already produced, so its refusal risk is negligible. We still check
 * `stop_reason`.
 */
export async function structureReport(opts: {
  description: string
  notes: string
  truncated: boolean
  client?: MinimalClient
}): Promise<StructureResult> {
  const client = (opts.client ?? getClient()) as unknown as MinimalClient

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(ReportSchema),
    },
    system: STRUCTURING_SYSTEM,
    messages: [
      {
        role: 'user',
        content: structuringPrompt(opts.description, opts.notes, opts.truncated),
      },
    ],
  })

  assertNotRefused(response as { stop_reason: string | null })

  if (!response.parsed_output) {
    throw new Error(
      'Structuring pass did not return a parsed report. ' +
        `stop_reason=${String(response.stop_reason)}`,
    )
  }

  // Re-validate rather than trusting the SDK's parse blindly; this is the
  // boundary between model output and our type system.
  let report = ReportSchema.parse(response.parsed_output)

  // The model is instructed to obey the comparables threshold, but the rule is
  // enforced in code because a fabricated valuation range is the one output
  // here that could do real damage.
  report = enforceValuationIntegrity(report)

  if (opts.truncated) report = { ...report, confidence: 'low' }

  const usage = addUsage(
    emptyUsage(),
    (response.usage ?? {}) as Record<string, number>,
  )

  return { report, usage }
}
