# Competitor Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js app where a founder pastes a company description and receives a live-researched, source-backed competitor analysis dashboard that persists to a shareable URL.

**Architecture:** Two-phase Claude pipeline — phase 1 researches the live web with Claude's server-side `web_search`/`web_fetch` tools and emits free-form notes; phase 2 reshapes those notes into a strict Zod-validated JSON payload. A detached background job writes progress rows to SQLite as it goes, so the report page can stream real progress and survive a refresh.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Zod, Recharts 3, better-sqlite3, Vitest, `@anthropic-ai/sdk`.

**Spec:** `docs/superpowers/specs/2026-07-25-competitor-analysis-design.md`

## Global Constraints

- **Model is `claude-opus-5`** everywhere. Never substitute another model.
- **Never send `temperature`, `top_p`, `top_k`, or `thinking.budget_tokens`** — all four return HTTP 400 on Claude Opus 5.
- **Never send a last-assistant-turn prefill** — returns 400 on Claude Opus 5.
- **Always check `stop_reason` before reading `response.content`.** A refusal returns HTTP 200 with empty or partial content; indexing `content[0]` blind will crash.
- **Streaming is mandatory when `max_tokens > 16000`** or the SDK hits an HTTP timeout.
- **Do NOT declare the `code_execution` tool.** The `web_search_20260209` / `web_fetch_20260209` variants have dynamic filtering built in; a second execution environment degrades the model.
- **`ANTHROPIC_API_KEY` is server-side only.** No file under `components/` or any file carrying `"use client"` may import `@anthropic-ai/sdk` or `lib/claude`.
- **All SQL lives in `lib/db.ts`.** No other module issues a query.
- **No test makes a live API call.** Claude is mocked everywhere.
- **Valuation integrity:** `Comparable.source` is required and non-nullable; every numeric field on a comparable is nullable; fewer than 3 sourced comparables ⇒ `impliedRange` is `null`.

## Deviation from spec (deliberate)

The spec says both Claude calls enable `fallbacks: "default"`. Server-side fallbacks require the beta messages endpoint, but the schema-constrained helper `client.messages.parse()` is on the non-beta path. **Phase 1 (research) enables fallbacks; phase 2 (structuring) does not** — it only checks `stop_reason`. Phase 2 sends no external web content and merely reshapes text already accepted by phase 1, so its refusal risk is negligible. Task 7 records this as a code comment.

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/analysis/schema.ts` | Zod schema + inferred types + valuation integrity rule. Single source of truth. |
| `lib/cost.ts` | Token usage accumulation and USD estimation. |
| `lib/db.ts` | SQLite schema + repository. The only SQL in the app. |
| `lib/ratelimit.ts` | Rate-limit policy (calls into `lib/db.ts` for storage). |
| `lib/claude.ts` | Anthropic client, model constants, refusal detection. |
| `lib/analysis/prompts.ts` | Research and structuring prompt text. |
| `lib/analysis/research.ts` | Phase 1: web research, `pause_turn` resumption, progress derivation. |
| `lib/analysis/structure.ts` | Phase 2: schema-constrained synthesis. |
| `lib/analysis/run.ts` | Orchestrator. The only module that knows about both phases and the DB. |
| `app/api/analyze/route.ts` | POST — validate, rate-limit, create row, kick off job. |
| `app/api/report/[id]/stream/route.ts` | GET — SSE progress feed. |
| `app/page.tsx` | Input form. |
| `app/report/[id]/page.tsx` | Report page — dispatches on status. |
| `components/RunProgress.tsx` | Client component, consumes the SSE feed. |
| `components/dashboard/*.tsx` | Five presentational panels. No data fetching, no Claude. |

---

### Task 1: Project scaffold and SDK surface verification

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `.env.example`, `.gitignore`
- Test: `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` and `npm run dev`.

- [ ] **Step 1: Create the Next.js project non-interactively**

```bash
cd /Users/dendisuhubdy/Github/competitor_analysis
npx --yes create-next-app@latest . \
  --typescript --tailwind --app --eslint \
  --src-dir=false --import-alias "@/*" --turbopack --no-git --yes
```

If it refuses because the directory is non-empty, that is expected — it only
contains `docs/`. Re-run with `--yes` after confirming `docs/` is preserved.

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install @anthropic-ai/sdk zod better-sqlite3 nanoid recharts@^3
npm install -D vitest @types/better-sqlite3
```

Recharts 3 is required — Recharts 2.x has unresolved peer-dependency conflicts
with React 19.

- [ ] **Step 3: Verify the SDK helpers this plan depends on actually exist**

The plan calls four SDK surfaces. Confirm each before building on them:

```bash
grep -r "zodOutputFormat" node_modules/@anthropic-ai/sdk/helpers/zod.d.ts | head -3
grep -rn "parse" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts | grep -i "parse(" | head -3
grep -rn "contentBlock" node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.d.ts | head -5
grep -rn "fallbacks" node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts | head -5
```

Expected: `zodOutputFormat` exported; `parse(` present on the Messages resource;
a `contentBlock` event on `BetaMessageStream`; a `fallbacks` field on the beta
message params.

**If `contentBlock` is absent**, Task 6 must accumulate `input_json_delta`
chunks manually — that task documents the fallback. **If `fallbacks` is absent
or typed narrowly**, pass it through a `// @ts-expect-error SDK typings lag the
fallbacks parameter` line rather than dropping the feature. Record which
surfaces were missing in the commit message.

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['**/__tests__/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 5: Write the smoke test**

Create `lib/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('toolchain', () => {
  it('runs typescript tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 7: Create `.env.example` and confirm `.env*` is gitignored**

`.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-...
RATE_LIMIT_MAX=5
DATABASE_PATH=./data/reports.db
```

Confirm `.gitignore` contains `.env*` and add `data/` to it. Verify with
`git status --short` that no `.env` or `data/` entry appears.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with vitest and SDK deps"
```

---

### Task 2: Report schema and valuation integrity rule

**Files:**
- Create: `lib/analysis/schema.ts`
- Test: `lib/analysis/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ReportSchema` (Zod object), types `Report`, `Competitor`, `Comparable`, `Source`, `Positioning`, `Swot`, `Moat`, `Gap`, `Wedge`, `Valuation`; constant `MIN_COMPARABLES_FOR_RANGE = 3`; function `enforceValuationIntegrity(report: Report): Report`.

- [ ] **Step 1: Write the failing tests**

Create `lib/analysis/__tests__/schema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/analysis/__tests__/schema.test.ts`
Expected: FAIL — cannot resolve `@/lib/analysis/schema`.

- [ ] **Step 3: Write the schema**

Create `lib/analysis/schema.ts`:

```ts
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

export const ReportSchema = z.object({
  company: z.object({
    name: z.string(),
    oneLiner: z.string(),
    category: z.string(),
    inferredStage: z.string(),
  }),
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/analysis/__tests__/schema.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/schema.ts lib/analysis/__tests__/schema.test.ts
git commit -m "feat: add report schema with valuation integrity rules"
```

---

### Task 3: Cost accounting

**Files:**
- Create: `lib/cost.ts`
- Test: `lib/__tests__/cost.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: type `UsageSummary`; functions `emptyUsage()`, `addUsage(acc, usage, webSearches?)`, `estimateTokenCostUsd(u)`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/cost.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { emptyUsage, addUsage, estimateTokenCostUsd } from '@/lib/cost'

describe('cost', () => {
  it('starts at zero', () => {
    const u = emptyUsage()
    expect(u.inputTokens).toBe(0)
    expect(u.estimatedTokenCostUsd).toBe(0)
  })

  it('accumulates across calls and tolerates missing cache fields', () => {
    let u = emptyUsage()
    u = addUsage(u, { input_tokens: 1000, output_tokens: 500 })
    u = addUsage(u, {
      input_tokens: 2000,
      output_tokens: 100,
      cache_read_input_tokens: 300,
    })
    expect(u.inputTokens).toBe(3000)
    expect(u.outputTokens).toBe(600)
    expect(u.cacheReadTokens).toBe(300)
  })

  it('counts web searches separately', () => {
    let u = emptyUsage()
    u = addUsage(u, { input_tokens: 0, output_tokens: 0 }, 4)
    expect(u.webSearches).toBe(4)
  })

  it('prices 1M input + 1M output at $30', () => {
    const cost = estimateTokenCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      webSearches: 0,
      estimatedTokenCostUsd: 0,
    })
    expect(cost).toBeCloseTo(30, 5)
  })

  it('prices cache reads at one tenth of input', () => {
    const cost = estimateTokenCostUsd({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 0,
      webSearches: 0,
      estimatedTokenCostUsd: 0,
    })
    expect(cost).toBeCloseTo(0.5, 5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/cost.test.ts`
Expected: FAIL — cannot resolve `@/lib/cost`.

- [ ] **Step 3: Write the implementation**

Create `lib/cost.ts`:

```ts
/**
 * Claude Opus 5 pricing, USD per million tokens.
 * Cache reads bill at ~0.1x input; cache writes at ~1.25x input.
 *
 * Web searches are billed separately by Anthropic and are NOT priced here —
 * we count them and label the figure a token cost, rather than inventing a
 * per-search rate.
 */
const INPUT_PER_MTOK = 5
const OUTPUT_PER_MTOK = 25
const CACHE_READ_PER_MTOK = INPUT_PER_MTOK * 0.1
const CACHE_WRITE_PER_MTOK = INPUT_PER_MTOK * 1.25

export interface UsageSummary {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  webSearches: number
  estimatedTokenCostUsd: number
}

/** The subset of the SDK `usage` object we consume. */
export interface RawUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function emptyUsage(): UsageSummary {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearches: 0,
    estimatedTokenCostUsd: 0,
  }
}

export function estimateTokenCostUsd(u: UsageSummary): number {
  return (
    (u.inputTokens / 1e6) * INPUT_PER_MTOK +
    (u.outputTokens / 1e6) * OUTPUT_PER_MTOK +
    (u.cacheReadTokens / 1e6) * CACHE_READ_PER_MTOK +
    (u.cacheCreationTokens / 1e6) * CACHE_WRITE_PER_MTOK
  )
}

export function addUsage(
  acc: UsageSummary,
  usage: RawUsage,
  webSearches = 0,
): UsageSummary {
  const next: UsageSummary = {
    inputTokens: acc.inputTokens + (usage.input_tokens ?? 0),
    outputTokens: acc.outputTokens + (usage.output_tokens ?? 0),
    cacheReadTokens: acc.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
    cacheCreationTokens:
      acc.cacheCreationTokens + (usage.cache_creation_input_tokens ?? 0),
    webSearches: acc.webSearches + webSearches,
    estimatedTokenCostUsd: 0,
  }
  next.estimatedTokenCostUsd = estimateTokenCostUsd(next)
  return next
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/cost.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/cost.ts lib/__tests__/cost.test.ts
git commit -m "feat: add token usage accounting and cost estimation"
```

---

### Task 4: SQLite repository

**Files:**
- Create: `lib/db.ts`
- Test: `lib/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `Report` from `lib/analysis/schema`, `UsageSummary` from `lib/cost`.
- Produces: types `ReportStatus`, `ReportRow`, `ProgressEvent`, `ProgressKind`, `Phase`; functions `getDb()`, `createReport(input)`, `appendProgress(reportId, phase, kind, detail)`, `getReport(id)`, `listProgressSince(reportId, sinceId)`, `finishReport(id, payload, usage)`, `failReport(id, error)`, `countRateLimitHits(ip, sinceMs)`, `recordRateLimitHit(ip)`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let dbPath: string

beforeEach(() => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'test.db')
  process.env.DATABASE_PATH = dbPath
})

afterEach(async () => {
  const { closeDb } = await import('@/lib/db')
  closeDb()
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true })
})

async function freshDb() {
  // Reset the module so each test gets a database at the new DATABASE_PATH.
  const { resetDbForTests, ...rest } = await import('@/lib/db')
  resetDbForTests()
  return rest
}

describe('report repository', () => {
  it('creates a running report and reads it back', async () => {
    const db = await freshDb()
    const id = db.createReport('an AI notetaker for lawyers')
    const row = db.getReport(id)
    expect(row).not.toBeNull()
    expect(row!.status).toBe('running')
    expect(row!.input).toBe('an AI notetaker for lawyers')
    expect(row!.payload).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    const db = await freshDb()
    expect(db.getReport('nope')).toBeNull()
  })

  it('appends progress and lists it incrementally', async () => {
    const db = await freshDb()
    const id = db.createReport('x')
    db.appendProgress(id, 'research', 'search', 'competitors to acme')
    db.appendProgress(id, 'research', 'fetch', 'https://rival.com/pricing')

    const all = db.listProgressSince(id, 0)
    expect(all).toHaveLength(2)
    expect(all[0].detail).toBe('competitors to acme')

    const tail = db.listProgressSince(id, all[0].id)
    expect(tail).toHaveLength(1)
    expect(tail[0].kind).toBe('fetch')
  })

  it('round-trips a finished payload as parsed JSON', async () => {
    const db = await freshDb()
    const id = db.createReport('x')
    const payload = { confidence: 'high' } as never
    const usage = {
      inputTokens: 10,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      webSearches: 1,
      estimatedTokenCostUsd: 0.001,
    }
    db.finishReport(id, payload, usage)

    const row = db.getReport(id)!
    expect(row.status).toBe('done')
    expect(row.payload).toEqual({ confidence: 'high' })
    expect(row.usage!.webSearches).toBe(1)
    expect(row.completedAt).toBeTypeOf('number')
  })

  it('records a failure with its message', async () => {
    const db = await freshDb()
    const id = db.createReport('x')
    db.failReport(id, 'refused: cyber')
    const row = db.getReport(id)!
    expect(row.status).toBe('failed')
    expect(row.error).toBe('refused: cyber')
  })

  it('counts rate limit hits only inside the window', async () => {
    const db = await freshDb()
    db.recordRateLimitHit('1.2.3.4')
    db.recordRateLimitHit('1.2.3.4')
    db.recordRateLimitHit('5.6.7.8')

    expect(db.countRateLimitHits('1.2.3.4', Date.now() - 1000)).toBe(2)
    expect(db.countRateLimitHits('1.2.3.4', Date.now() + 1000)).toBe(0)
    expect(db.countRateLimitHits('9.9.9.9', Date.now() - 1000)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/db.test.ts`
Expected: FAIL — cannot resolve `@/lib/db`.

- [ ] **Step 3: Write the implementation**

Create `lib/db.ts`:

```ts
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'
import type { Report } from '@/lib/analysis/schema'
import type { UsageSummary } from '@/lib/cost'

/**
 * The ONLY module in the app that issues SQL. Everything else goes through
 * these functions.
 *
 * DEPLOYMENT NOTE: better-sqlite3 writes to the local filesystem, which is
 * ephemeral on serverless platforms such as Vercel. To deploy, swap the
 * `Database` construction below for a Turso/libSQL client (same SQL dialect)
 * or Postgres. Because no SQL exists outside this file, that is a one-file
 * change.
 */

export type ReportStatus = 'running' | 'done' | 'failed'
export type Phase = 'research' | 'structuring'
export type ProgressKind = 'phase' | 'search' | 'fetch' | 'thinking' | 'done' | 'error'

export interface ReportRow {
  id: string
  input: string
  status: ReportStatus
  payload: Report | null
  error: string | null
  usage: UsageSummary | null
  createdAt: number
  completedAt: number | null
}

export interface ProgressEvent {
  id: number
  reportId: string
  phase: Phase
  kind: ProgressKind
  detail: string
  createdAt: number
}

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const file = process.env.DATABASE_PATH ?? './data/reports.db'
  fs.mkdirSync(path.dirname(file), { recursive: true })
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id           TEXT PRIMARY KEY,
      input        TEXT NOT NULL,
      status       TEXT NOT NULL,
      payload      TEXT,
      error        TEXT,
      usage        TEXT,
      created_at   INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS progress_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id  TEXT NOT NULL REFERENCES reports(id),
      phase      TEXT NOT NULL,
      kind       TEXT NOT NULL,
      detail     TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_progress_report
      ON progress_events(report_id, id);
    CREATE TABLE IF NOT EXISTS rate_limits (
      ip         TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limits_ip
      ON rate_limits(ip, created_at);
  `)
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

/** Test-only: forget the cached handle so a new DATABASE_PATH takes effect. */
export function resetDbForTests(): void {
  db = null
}

export function createReport(input: string): string {
  const id = nanoid(12)
  getDb()
    .prepare(
      `INSERT INTO reports (id, input, status, created_at)
       VALUES (?, ?, 'running', ?)`,
    )
    .run(id, input, Date.now())
  return id
}

export function appendProgress(
  reportId: string,
  phase: Phase,
  kind: ProgressKind,
  detail: string,
): void {
  getDb()
    .prepare(
      `INSERT INTO progress_events (report_id, phase, kind, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(reportId, phase, kind, detail, Date.now())
}

export function getReport(id: string): ReportRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM reports WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: row.id as string,
    input: row.input as string,
    status: row.status as ReportStatus,
    payload: row.payload ? (JSON.parse(row.payload as string) as Report) : null,
    error: (row.error as string | null) ?? null,
    usage: row.usage ? (JSON.parse(row.usage as string) as UsageSummary) : null,
    createdAt: row.created_at as number,
    completedAt: (row.completed_at as number | null) ?? null,
  }
}

export function listProgressSince(
  reportId: string,
  sinceId: number,
): ProgressEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM progress_events
       WHERE report_id = ? AND id > ?
       ORDER BY id ASC`,
    )
    .all(reportId, sinceId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: r.id as number,
    reportId: r.report_id as string,
    phase: r.phase as Phase,
    kind: r.kind as ProgressKind,
    detail: r.detail as string,
    createdAt: r.created_at as number,
  }))
}

export function finishReport(
  id: string,
  payload: Report,
  usage: UsageSummary,
): void {
  getDb()
    .prepare(
      `UPDATE reports
       SET status = 'done', payload = ?, usage = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(payload), JSON.stringify(usage), Date.now(), id)
}

export function failReport(id: string, error: string): void {
  getDb()
    .prepare(
      `UPDATE reports SET status = 'failed', error = ?, completed_at = ?
       WHERE id = ?`,
    )
    .run(error, Date.now(), id)
}

export function recordRateLimitHit(ip: string): void {
  getDb()
    .prepare(`INSERT INTO rate_limits (ip, created_at) VALUES (?, ?)`)
    .run(ip, Date.now())
}

export function countRateLimitHits(ip: string, sinceMs: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM rate_limits WHERE ip = ? AND created_at >= ?`,
    )
    .get(ip, sinceMs) as { n: number }
  return row.n
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/db.test.ts`
Expected: PASS, 6 tests.

If `better-sqlite3` fails to load with a `NODE_MODULE_VERSION` mismatch, run
`npm rebuild better-sqlite3` and re-run.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/__tests__/db.test.ts
git commit -m "feat: add SQLite repository for reports and progress"
```

---

### Task 5: Rate limiting

**Files:**
- Create: `lib/ratelimit.ts`
- Test: `lib/__tests__/ratelimit.test.ts`

**Interfaces:**
- Consumes: `countRateLimitHits`, `recordRateLimitHit` from `lib/db`.
- Produces: `RATE_LIMIT_WINDOW_MS`, `rateLimitMax()`, `checkRateLimit(ip): { allowed: boolean; remaining: number; resetAt: number }`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/ratelimit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  countRateLimitHits: vi.fn(),
  recordRateLimitHit: vi.fn(),
}))

import { countRateLimitHits, recordRateLimitHit } from '@/lib/db'
import { checkRateLimit } from '@/lib/ratelimit'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RATE_LIMIT_MAX = '3'
})

describe('checkRateLimit', () => {
  it('allows and records when under the limit', () => {
    vi.mocked(countRateLimitHits).mockReturnValue(1)
    const r = checkRateLimit('1.1.1.1')
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(1)
    expect(recordRateLimitHit).toHaveBeenCalledWith('1.1.1.1')
  })

  it('blocks at the limit and does not record', () => {
    vi.mocked(countRateLimitHits).mockReturnValue(3)
    const r = checkRateLimit('1.1.1.1')
    expect(r.allowed).toBe(false)
    expect(r.remaining).toBe(0)
    expect(recordRateLimitHit).not.toHaveBeenCalled()
  })

  it('never reports negative remaining', () => {
    vi.mocked(countRateLimitHits).mockReturnValue(99)
    expect(checkRateLimit('1.1.1.1').remaining).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/ratelimit.test.ts`
Expected: FAIL — cannot resolve `@/lib/ratelimit`.

- [ ] **Step 3: Write the implementation**

Create `lib/ratelimit.ts`:

```ts
import { countRateLimitHits, recordRateLimitHit } from '@/lib/db'

export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

/**
 * Read at call time, not module load, so tests and deploys can change it
 * without a restart.
 */
export function rateLimitMax(): number {
  const raw = Number(process.env.RATE_LIMIT_MAX)
  return Number.isFinite(raw) && raw > 0 ? raw : 5
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * The API key is server-side and every run costs real money, so this is not
 * optional. Records the hit only when the request is allowed.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const max = rateLimitMax()
  const windowStart = Date.now() - RATE_LIMIT_WINDOW_MS
  const used = countRateLimitHits(ip, windowStart)
  const allowed = used < max

  if (allowed) recordRateLimitHit(ip)

  return {
    allowed,
    remaining: Math.max(0, max - used - (allowed ? 1 : 0)),
    resetAt: Date.now() + RATE_LIMIT_WINDOW_MS,
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/ratelimit.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/ratelimit.ts lib/__tests__/ratelimit.test.ts
git commit -m "feat: add per-IP rate limiting"
```

---

### Task 6: Claude client and prompts

**Files:**
- Create: `lib/claude.ts`, `lib/analysis/prompts.ts`
- Test: `lib/__tests__/claude.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MODEL`, `FALLBACK_BETA`, `getClient()`, `class RefusalError`, `assertNotRefused(msg)`, `WEB_TOOLS`; and from prompts: `RESEARCH_SYSTEM`, `STRUCTURING_SYSTEM`, `researchPrompt(description)`, `structuringPrompt(description, notes, truncated)`.

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/claude.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/claude.test.ts`
Expected: FAIL — cannot resolve `@/lib/claude`.

- [ ] **Step 3: Write `lib/claude.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk'

/** Non-negotiable. Never substitute another model. */
export const MODEL = 'claude-opus-5'

/**
 * Server-side fallbacks. `"default"` routes by refusal category rather than
 * pinning a fallback model, so it needs no maintenance when models change.
 */
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

/**
 * The `_20260209` variants have dynamic filtering built in — they run code
 * server-side under the hood. Do NOT additionally declare `code_execution`;
 * a second execution environment confuses the model.
 */
export const WEB_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search', max_uses: 20 },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 15 },
] as const

let client: Anthropic | null = null

/**
 * Server-only. Importing this module from a client component would leak the
 * API key into the browser bundle.
 */
export function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set')
    }
    client = new Anthropic()
  }
  return client
}

export class RefusalError extends Error {
  readonly category: string | null
  constructor(category: string | null, explanation?: string | null) {
    super(
      `Claude declined this request${category ? ` (${category})` : ''}` +
        `${explanation ? `: ${explanation}` : ''}`,
    )
    this.name = 'RefusalError'
    this.category = category
  }
}

interface StopShape {
  stop_reason: string | null
  stop_details?: { category?: string | null; explanation?: string | null } | null
}

/**
 * Call this BEFORE reading `message.content`. A refusal is an HTTP 200 with
 * empty or partial content — indexing `content[0]` blind will crash.
 * `stop_details` may be null even on a refusal, so never branch on it.
 */
export function assertNotRefused(msg: StopShape): void {
  if (msg.stop_reason !== 'refusal') return
  throw new RefusalError(
    msg.stop_details?.category ?? null,
    msg.stop_details?.explanation ?? null,
  )
}
```

- [ ] **Step 4: Write `lib/analysis/prompts.ts`**

```ts
import { MIN_COMPARABLES_FOR_RANGE } from '@/lib/analysis/schema'

export const RESEARCH_SYSTEM = `You are a competitive intelligence analyst working for a startup founder.

You research markets using web search and web fetch. You are blunt, specific, and evidence-driven. You never present an unsourced claim as fact.

Rules you never break:
- Every factual claim about a competitor — funding, pricing, headcount, customers — carries the URL you got it from, inline.
- If you cannot find something, say so plainly. Never estimate a number and present it as researched.
- Prefer primary sources (a company's own pricing page, an SEC filing, a funding announcement) over aggregators and listicles.
- Recency matters. Note the date of anything time-sensitive.`

export const STRUCTURING_SYSTEM = `You convert competitive research notes into a structured report.

You are a formatter, not a researcher. Use only what the notes contain. Never introduce a company, number, or URL that does not appear in the notes. If the notes lack something a field requires, use null or an empty array rather than inventing a plausible value.`

export function researchPrompt(description: string): string {
  return `Research the competitive landscape for this company.

<company_description>
${description}
</company_description>

Work through these in order, searching as you go:

1. **Identify the company and market.** What does it actually do, what category is it in, and what stage does it appear to be at?

2. **Find competitors.** Aim for 5-8. Classify each as:
   - direct — solves the same problem for the same buyer
   - adjacent — overlapping problem or overlapping buyer, not both
   - emerging — early, but on a trajectory to become direct
   For each, find: what it does, pricing (visit the pricing page), funding history, target segment, and its genuine strengths and weaknesses.

3. **Find the two axes that actually separate this market.** Not generic "price vs quality" unless that is truly the split. Look for the dimensions practitioners in this space argue about. Place the company and each competitor on both.

4. **Assess defensibility.** Is there a real moat here — data, network effects, switching costs, distribution, regulatory — or is this a commodity fight? Be willing to say it is a commodity fight.

5. **Find the gaps.** Which segments or needs is nobody serving well, and why has nobody served them? Distinguish "nobody has noticed" from "everybody tried and it does not work".

6. **Find funding comparables.** Search for rounds actually raised by companies in this space over the last ~24 months: stage, amount, post-money valuation where disclosed, and the date.

   CRITICAL: every comparable must have a URL you actually retrieved it from. If you cannot source a round, **omit it entirely** — do not estimate, do not extrapolate, do not include a company you merely believe raised money. A founder may walk into a fundraise citing these numbers. An invented comparable is worse than a missing one. If you can find fewer than ${MIN_COMPARABLES_FOR_RANGE} sourced comparables, say so explicitly.

Write up your findings as detailed notes with inline source URLs. Do not format as JSON — a later step handles that.`
}

export function structuringPrompt(
  description: string,
  notes: string,
  truncated: boolean,
): string {
  const warning = truncated
    ? `\nNOTE: research was cut short and is incomplete. Set "confidence" to "low" and add a caveat to the valuation section explaining that research did not run to completion.\n`
    : ''

  return `Convert these research notes into the structured report format.

<company_description>
${description}
</company_description>

<research_notes>
${notes}
</research_notes>
${warning}
Field guidance:
- overlapScore: 0-100, how directly this competitor competes for the same customer.
- positioning points: x and y on a 0-100 scale matching the axes you define. Exactly one point must have isYou = true.
- moat.verdict: be honest. "none" and "weak" are valid and common answers.
- valuation.comparables: include ONLY rounds with a source URL present in the notes. Every numeric field may be null; the source may not.
- valuation.impliedRange: derive it only from the comparables you listed. If there are fewer than ${MIN_COMPARABLES_FOR_RANGE} sourced comparables, set it to null.
- valuation.caveats: state what the range does and does not account for.
- confidence: "high" only if the notes contain sourced detail on most competitors.
- sources: the deduplicated union of every URL cited anywhere in the report.`
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/claude.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/claude.ts lib/analysis/prompts.ts lib/__tests__/claude.test.ts
git commit -m "feat: add Claude client config and analysis prompts"
```

---

### Task 7: Phase 1 — web research with pause_turn resumption

**Files:**
- Create: `lib/analysis/research.ts`
- Test: `lib/analysis/__tests__/research.test.ts`

**Interfaces:**
- Consumes: `getClient`, `MODEL`, `WEB_TOOLS`, `FALLBACK_BETA`, `assertNotRefused`, `RefusalError` from `lib/claude`; `RESEARCH_SYSTEM`, `researchPrompt` from `lib/analysis/prompts`; `emptyUsage`, `addUsage`, `UsageSummary` from `lib/cost`.
- Produces: `MAX_CONTINUATIONS = 5`; `interface ResearchResult { notes: string; usage: UsageSummary; truncated: boolean }`; `runResearch(opts: { description: string; onProgress: (kind, detail) => void; client?: MinimalClient }): Promise<ResearchResult>`.

- [ ] **Step 1: Write the failing tests**

Create `lib/analysis/__tests__/research.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { runResearch, MAX_CONTINUATIONS } from '@/lib/analysis/research'
import { RefusalError } from '@/lib/claude'

/** Build a fake message the way the SDK returns it. */
function message(opts: {
  stop?: string
  text?: string
  tools?: { name: string; input: Record<string, string> }[]
  refusalCategory?: string
}) {
  const content: Record<string, unknown>[] = []
  for (const t of opts.tools ?? []) {
    content.push({ type: 'server_tool_use', name: t.name, input: t.input })
  }
  if (opts.text) content.push({ type: 'text', text: opts.text })
  return {
    stop_reason: opts.stop ?? 'end_turn',
    stop_details: opts.refusalCategory
      ? { category: opts.refusalCategory, explanation: 'no' }
      : null,
    content,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

/** Minimal stand-in for client.beta.messages.stream(). */
function fakeClient(messages: ReturnType<typeof message>[]) {
  let call = 0
  const seen: unknown[][] = []
  return {
    calls: seen,
    beta: {
      messages: {
        stream: (params: { messages: unknown[] }) => {
          seen.push(params.messages)
          const msg = messages[Math.min(call++, messages.length - 1)]
          return {
            finalMessage: async () => msg,
            on: () => {},
          }
        },
      },
    },
  }
}

describe('runResearch', () => {
  it('returns the assembled notes on a clean run', async () => {
    const client = fakeClient([message({ text: 'Rival raised $12M.' })])
    const r = await runResearch({
      description: 'ai notetaker',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.notes).toContain('Rival raised $12M.')
    expect(r.truncated).toBe(false)
  })

  it('resumes on pause_turn and concatenates both turns', async () => {
    const client = fakeClient([
      message({ stop: 'pause_turn', text: 'part one.' }),
      message({ stop: 'end_turn', text: 'part two.' }),
    ])
    const r = await runResearch({
      description: 'x',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.notes).toContain('part one.')
    expect(r.notes).toContain('part two.')
    expect(r.truncated).toBe(false)
    // Second request must carry the paused assistant turn back.
    expect(client.calls[1].length).toBeGreaterThan(client.calls[0].length)
  })

  it('stops at the continuation cap and marks the result truncated', async () => {
    const client = fakeClient([message({ stop: 'pause_turn', text: 'more.' })])
    const r = await runResearch({
      description: 'x',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.truncated).toBe(true)
    expect(client.calls.length).toBe(MAX_CONTINUATIONS + 1)
  })

  it('throws RefusalError without reading content', async () => {
    const client = fakeClient([
      message({ stop: 'refusal', refusalCategory: 'cyber' }),
    ])
    await expect(
      runResearch({ description: 'x', onProgress: () => {}, client: client as never }),
    ).rejects.toBeInstanceOf(RefusalError)
  })

  it('emits a search progress step carrying the real query', async () => {
    const client = fakeClient([
      message({
        text: 'done',
        tools: [{ name: 'web_search', input: { query: 'rival pricing 2026' } }],
      }),
    ])
    const onProgress = vi.fn()
    await runResearch({
      description: 'x',
      onProgress,
      client: client as never,
    })
    expect(onProgress).toHaveBeenCalledWith('search', 'rival pricing 2026')
  })

  it('emits a fetch progress step carrying the real url', async () => {
    const client = fakeClient([
      message({
        text: 'done',
        tools: [{ name: 'web_fetch', input: { url: 'https://rival.com/pricing' } }],
      }),
    ])
    const onProgress = vi.fn()
    await runResearch({ description: 'x', onProgress, client: client as never })
    expect(onProgress).toHaveBeenCalledWith('fetch', 'https://rival.com/pricing')
  })

  it('counts web searches in the usage summary', async () => {
    const client = fakeClient([
      message({
        text: 'done',
        tools: [
          { name: 'web_search', input: { query: 'a' } },
          { name: 'web_search', input: { query: 'b' } },
        ],
      }),
    ])
    const r = await runResearch({
      description: 'x',
      onProgress: () => {},
      client: client as never,
    })
    expect(r.usage.webSearches).toBe(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/analysis/__tests__/research.test.ts`
Expected: FAIL — cannot resolve `@/lib/analysis/research`.

- [ ] **Step 3: Write the implementation**

Create `lib/analysis/research.ts`:

```ts
import {
  getClient,
  MODEL,
  WEB_TOOLS,
  FALLBACK_BETA,
  assertNotRefused,
} from '@/lib/claude'
import { RESEARCH_SYSTEM, researchPrompt } from '@/lib/analysis/prompts'
import { emptyUsage, addUsage, type UsageSummary } from '@/lib/cost'

/**
 * Server-tool loops stop at the server-side iteration limit with
 * `stop_reason: "pause_turn"`. We append the paused assistant turn and
 * re-send to resume. Capped so a pathological run cannot spin forever.
 */
export const MAX_CONTINUATIONS = 5

export interface ResearchResult {
  notes: string
  usage: UsageSummary
  /** True if we hit MAX_CONTINUATIONS — the caller should degrade confidence. */
  truncated: boolean
}

export type ProgressFn = (kind: 'search' | 'fetch' | 'thinking', detail: string) => void

/** Structural type so tests can inject a stub without the whole SDK. */
interface MinimalClient {
  beta: {
    messages: {
      stream: (params: Record<string, unknown>) => {
        finalMessage: () => Promise<Record<string, unknown>>
        on?: (event: string, cb: (block: Record<string, unknown>) => void) => void
      }
    }
  }
}

export async function runResearch(opts: {
  description: string
  onProgress: ProgressFn
  client?: MinimalClient
}): Promise<ResearchResult> {
  const client = (opts.client ?? getClient()) as MinimalClient
  const messages: Record<string, unknown>[] = [
    { role: 'user', content: researchPrompt(opts.description) },
  ]

  let usage = emptyUsage()
  let notes = ''
  let truncated = false

  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      // Streaming is mandatory above ~16k max_tokens or the SDK times out.
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
      system: RESEARCH_SYSTEM,
      tools: WEB_TOOLS,
      betas: [FALLBACK_BETA],
      // Route refusals to a fallback model by category. SDK typings may lag
      // this parameter; the cast keeps it rather than dropping the feature.
      fallbacks: 'default' as unknown as never,
      messages,
    })

    // Live progress: `contentBlock` fires with each fully-accumulated block.
    // If the installed SDK lacks this event (see Task 1 Step 3), delete this
    // and rely on the post-hoc scan below — progress becomes per-turn rather
    // than per-tool-call, but nothing else changes.
    stream.on?.('contentBlock', (block) => emitProgress(block, opts.onProgress))

    const msg = await stream.finalMessage()

    // MUST come before reading content — a refusal is a 200 with no content.
    assertNotRefused(msg as { stop_reason: string | null })

    const content = (msg.content ?? []) as Record<string, unknown>[]

    // Post-hoc scan. Progress emission is idempotent per (kind, detail) via
    // the dedupe set in run.ts, so double-emitting with the live handler is
    // harmless and this keeps the stub-driven tests honest.
    let searches = 0
    for (const block of content) {
      if (block.type === 'server_tool_use') {
        if (block.name === 'web_search') searches++
        if (!stream.on) emitProgress(block, opts.onProgress)
      }
    }

    usage = addUsage(usage, (msg.usage ?? {}) as Record<string, number>, searches)
    notes += textOf(content)

    if (msg.stop_reason !== 'pause_turn') {
      return { notes: notes.trim(), usage, truncated: false }
    }

    if (attempt === MAX_CONTINUATIONS) {
      truncated = true
      break
    }

    // Resume: append the paused assistant turn verbatim and re-send.
    messages.push({ role: 'assistant', content })
  }

  return { notes: notes.trim(), usage, truncated }
}

function emitProgress(block: Record<string, unknown>, onProgress: ProgressFn) {
  if (block.type !== 'server_tool_use') return
  const input = (block.input ?? {}) as Record<string, string>
  if (block.name === 'web_search' && input.query) {
    onProgress('search', input.query)
  } else if (block.name === 'web_fetch' && input.url) {
    onProgress('fetch', input.url)
  }
}

function textOf(content: Record<string, unknown>[]): string {
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text as string)
    .join('\n')
}
```

Note the `stream.on?.(...)` guard — the stub in the tests supplies `on` as a
no-op, so the post-hoc scan is what the assertions actually exercise. Both paths
produce identical progress events.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/analysis/__tests__/research.test.ts`
Expected: PASS, 7 tests.

The stub in the tests provides `on`, so `emitProgress` runs only via the
post-hoc scan. If a test fails on a missing progress call, check that the stub's
`on` is present but inert — it should be `on: () => {}`.

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/research.ts lib/analysis/__tests__/research.test.ts
git commit -m "feat: add phase 1 web research with pause_turn resumption"
```

---

### Task 8: Phase 2 — schema-constrained structuring

**Files:**
- Create: `lib/analysis/structure.ts`
- Test: `lib/analysis/__tests__/structure.test.ts`

**Interfaces:**
- Consumes: `getClient`, `MODEL`, `assertNotRefused` from `lib/claude`; `ReportSchema`, `enforceValuationIntegrity`, `Report` from `lib/analysis/schema`; `STRUCTURING_SYSTEM`, `structuringPrompt` from `lib/analysis/prompts`; `emptyUsage`, `addUsage` from `lib/cost`.
- Produces: `interface StructureResult { report: Report; usage: UsageSummary }`; `structureReport(opts: { description, notes, truncated, client? }): Promise<StructureResult>`.

- [ ] **Step 1: Write the failing tests**

Create `lib/analysis/__tests__/structure.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/analysis/__tests__/structure.test.ts`
Expected: FAIL — cannot resolve `@/lib/analysis/structure`.

- [ ] **Step 3: Write the implementation**

Create `lib/analysis/structure.ts`:

```ts
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
  const client = (opts.client ?? getClient()) as MinimalClient

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/analysis/__tests__/structure.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/analysis/structure.ts lib/analysis/__tests__/structure.test.ts
git commit -m "feat: add phase 2 schema-constrained structuring"
```

---

### Task 9: Orchestrator

**Files:**
- Create: `lib/analysis/run.ts`
- Test: `lib/analysis/__tests__/run.test.ts`

**Interfaces:**
- Consumes: `runResearch` from `lib/analysis/research`; `structureReport` from `lib/analysis/structure`; `appendProgress`, `finishReport`, `failReport` from `lib/db`; `addUsage`, `emptyUsage` from `lib/cost`.
- Produces: `runAnalysis(reportId: string, description: string): Promise<void>` — never throws; failures land in the DB.

- [ ] **Step 1: Write the failing tests**

Create `lib/analysis/__tests__/run.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  appendProgress: vi.fn(),
  finishReport: vi.fn(),
  failReport: vi.fn(),
}))
vi.mock('@/lib/analysis/research', () => ({ runResearch: vi.fn() }))
vi.mock('@/lib/analysis/structure', () => ({ structureReport: vi.fn() }))

import { appendProgress, finishReport, failReport } from '@/lib/db'
import { runResearch } from '@/lib/analysis/research'
import { structureReport } from '@/lib/analysis/structure'
import { runAnalysis } from '@/lib/analysis/run'

const usage = {
  inputTokens: 1,
  outputTokens: 1,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearches: 2,
  estimatedTokenCostUsd: 0.01,
}

beforeEach(() => vi.clearAllMocks())

describe('runAnalysis', () => {
  it('runs both phases and finishes the report', async () => {
    vi.mocked(runResearch).mockResolvedValue({
      notes: 'n',
      usage,
      truncated: false,
    })
    vi.mocked(structureReport).mockResolvedValue({
      report: { confidence: 'high' } as never,
      usage,
    })

    await runAnalysis('r1', 'ai notetaker')

    expect(runResearch).toHaveBeenCalledOnce()
    expect(structureReport).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'n', truncated: false }),
    )
    expect(finishReport).toHaveBeenCalledWith(
      'r1',
      { confidence: 'high' },
      expect.objectContaining({ webSearches: 4 }), // usage summed across phases
    )
    expect(failReport).not.toHaveBeenCalled()
  })

  it('records a failure instead of throwing', async () => {
    vi.mocked(runResearch).mockRejectedValue(new Error('boom'))
    await expect(runAnalysis('r2', 'x')).resolves.toBeUndefined()
    expect(failReport).toHaveBeenCalledWith('r2', expect.stringContaining('boom'))
    expect(finishReport).not.toHaveBeenCalled()
  })

  it('writes phase markers as progress', async () => {
    vi.mocked(runResearch).mockResolvedValue({ notes: 'n', usage, truncated: false })
    vi.mocked(structureReport).mockResolvedValue({
      report: {} as never,
      usage,
    })
    await runAnalysis('r3', 'x')
    const kinds = vi.mocked(appendProgress).mock.calls.map((c) => c[2])
    expect(kinds).toContain('phase')
    expect(kinds).toContain('done')
  })

  it('deduplicates identical progress details', async () => {
    vi.mocked(runResearch).mockImplementation(async ({ onProgress }) => {
      onProgress('search', 'same query')
      onProgress('search', 'same query')
      onProgress('search', 'other query')
      return { notes: 'n', usage, truncated: false }
    })
    vi.mocked(structureReport).mockResolvedValue({ report: {} as never, usage })

    await runAnalysis('r4', 'x')

    const searches = vi
      .mocked(appendProgress)
      .mock.calls.filter((c) => c[2] === 'search')
    expect(searches).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/analysis/__tests__/run.test.ts`
Expected: FAIL — cannot resolve `@/lib/analysis/run`.

- [ ] **Step 3: Write the implementation**

Create `lib/analysis/run.ts`:

```ts
import { runResearch } from '@/lib/analysis/research'
import { structureReport } from '@/lib/analysis/structure'
import { appendProgress, finishReport, failReport } from '@/lib/db'
import { emptyUsage, type UsageSummary } from '@/lib/cost'

function mergeUsage(a: UsageSummary, b: UsageSummary): UsageSummary {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    webSearches: a.webSearches + b.webSearches,
    estimatedTokenCostUsd: a.estimatedTokenCostUsd + b.estimatedTokenCostUsd,
  }
}

/**
 * The only module that knows about both phases and the database.
 *
 * Never throws. A failure is a row update, because this runs detached from any
 * request — an unhandled rejection here would take down the process and leave
 * the report stuck in 'running' forever.
 */
export async function runAnalysis(
  reportId: string,
  description: string,
): Promise<void> {
  try {
    // The model repeats queries; dedupe so the progress feed stays readable.
    const seen = new Set<string>()
    const emit = (kind: 'search' | 'fetch' | 'thinking', detail: string) => {
      const key = `${kind}:${detail}`
      if (seen.has(key)) return
      seen.add(key)
      appendProgress(reportId, 'research', kind, detail)
    }

    appendProgress(reportId, 'research', 'phase', 'Researching the live market')

    const research = await runResearch({
      description,
      onProgress: emit,
    })

    appendProgress(
      reportId,
      'structuring',
      'phase',
      research.truncated
        ? 'Research cut short — building report from partial findings'
        : 'Building the dashboard',
    )

    const structured = await structureReport({
      description,
      notes: research.notes,
      truncated: research.truncated,
    })

    const usage = mergeUsage(
      mergeUsage(emptyUsage(), research.usage),
      structured.usage,
    )

    finishReport(reportId, structured.report, usage)
    appendProgress(reportId, 'structuring', 'done', 'Report ready')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failReport(reportId, message)
    appendProgress(reportId, 'research', 'error', message)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/analysis/__tests__/run.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all tests across all files.

- [ ] **Step 6: Commit**

```bash
git add lib/analysis/run.ts lib/analysis/__tests__/run.test.ts
git commit -m "feat: add analysis orchestrator with progress dedupe"
```

---

### Task 10: API routes

**Files:**
- Create: `app/api/analyze/route.ts`, `app/api/report/[id]/stream/route.ts`

**Interfaces:**
- Consumes: `createReport`, `getReport`, `listProgressSince` from `lib/db`; `checkRateLimit` from `lib/ratelimit`; `runAnalysis` from `lib/analysis/run`.
- Produces: `POST /api/analyze` → `{ id }` (201) | `{ error }` (400/429); `GET /api/report/[id]/stream` → SSE.

- [ ] **Step 1: Write the analyze route**

Create `app/api/analyze/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createReport } from '@/lib/db'
import { checkRateLimit } from '@/lib/ratelimit'
import { runAnalysis } from '@/lib/analysis/run'

export const runtime = 'nodejs'

const MAX_INPUT = 4000
const MIN_INPUT = 20

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'local'
  )
}

export async function POST(req: NextRequest) {
  let description: unknown
  try {
    description = (await req.json())?.description
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (typeof description !== 'string' || description.trim().length < MIN_INPUT) {
    return NextResponse.json(
      { error: `Describe your company in at least ${MIN_INPUT} characters.` },
      { status: 400 },
    )
  }
  if (description.length > MAX_INPUT) {
    return NextResponse.json(
      { error: `Keep the description under ${MAX_INPUT} characters.` },
      { status: 400 },
    )
  }

  const limit = checkRateLimit(clientIp(req))
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit reached. Try again in an hour.' },
      { status: 429 },
    )
  }

  const id = createReport(description.trim())

  // Detached on purpose: the run takes 60-120s, far longer than a request
  // should be held open. Progress is persisted to SQLite as it goes, so the
  // client reattaches via the SSE endpoint and a disconnect does not cancel it.
  //
  // DEPLOYMENT NOTE: a floating promise works in a long-lived Node process.
  // On serverless this needs `waitUntil` or a queue.
  void runAnalysis(id, description.trim())

  return NextResponse.json({ id }, { status: 201 })
}
```

- [ ] **Step 2: Write the SSE progress route**

Create `app/api/report/[id]/stream/route.ts`:

```ts
import { NextRequest } from 'next/server'
import { getReport, listProgressSince } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const POLL_MS = 700

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  if (!getReport(id)) {
    return new Response('Not found', { status: 404 })
  }

  const encoder = new TextEncoder()
  let lastId = 0
  let timer: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      const tick = () => {
        try {
          // Replays everything since `lastId`, so a reconnecting client that
          // joins mid-run catches up rather than missing the earlier steps.
          for (const ev of listProgressSince(id, lastId)) {
            lastId = ev.id
            send({ type: 'progress', event: ev })
          }

          const row = getReport(id)
          if (row && row.status !== 'running') {
            send({ type: 'status', status: row.status, error: row.error })
            if (timer) clearInterval(timer)
            controller.close()
          }
        } catch {
          if (timer) clearInterval(timer)
          controller.close()
        }
      }

      tick()
      timer = setInterval(tick, POLL_MS)

      req.signal.addEventListener('abort', () => {
        if (timer) clearInterval(timer)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
    cancel() {
      if (timer) clearInterval(timer)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 3: Verify the routes compile**

Run: `npx tsc --noEmit`
Expected: no errors. If `ctx.params` typing complains, confirm the Next.js 15
signature — `params` is a Promise in App Router route handlers.

- [ ] **Step 4: Smoke-test the analyze route end to end**

```bash
# Terminal 1
npm run dev
```

```bash
# Terminal 2 — expect 400
curl -s -X POST localhost:3000/api/analyze \
  -H 'content-type: application/json' -d '{"description":"short"}'

# Expect 201 with an id (this spends real API credit)
curl -s -X POST localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"description":"An AI notetaker that produces citation-grade meeting records for law firms."}'

# Watch progress stream in (replace ID)
curl -N localhost:3000/api/report/ID/stream
```

Expected: the 400 case rejects; the valid case returns an id and the stream
emits `phase` then `search` events carrying real queries, then
`{"type":"status","status":"done"}`.

- [ ] **Step 5: Commit**

```bash
git add app/api
git commit -m "feat: add analyze and SSE progress routes"
```

---

### Task 11: Input form

**Files:**
- Create: `app/page.tsx`, `components/AnalyzeForm.tsx`
- Modify: `app/layout.tsx` (title/description metadata)

**Interfaces:**
- Consumes: `POST /api/analyze`.
- Produces: navigation to `/report/[id]`.

- [ ] **Step 1: Write the form component**

Create `components/AnalyzeForm.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const EXAMPLE =
  'We build an AI notetaker that produces citation-grade meeting records for law firms. Recordings are transcribed, every claim links back to a timestamp, and output exports to the formats litigation teams already use.'

export default function AnalyzeForm() {
  const router = useRouter()
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong.')
        setSubmitting(false)
        return
      }
      router.push(`/report/${body.id}`)
    } catch {
      setError('Could not reach the server.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-2xl">
      <label
        htmlFor="description"
        className="block text-sm font-medium text-neutral-300"
      >
        Describe your company
      </label>
      <textarea
        id="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={7}
        maxLength={4000}
        placeholder="What you build, who buys it, and what makes it different."
        className="mt-2 w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
        <button
          type="button"
          onClick={() => setDescription(EXAMPLE)}
          className="underline underline-offset-4 hover:text-neutral-300"
        >
          Use an example
        </button>
        <span>{description.length} / 4000</span>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || description.trim().length < 20}
        className="mt-6 w-full rounded-lg bg-neutral-100 px-5 py-3 font-medium text-neutral-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'Starting research…' : 'Run competitor analysis'}
      </button>
      <p className="mt-3 text-center text-xs text-neutral-500">
        Researches the live web. Takes 1–2 minutes.
      </p>
    </form>
  )
}
```

- [ ] **Step 2: Write the landing page**

Replace `app/page.tsx`:

```tsx
import AnalyzeForm from '@/components/AnalyzeForm'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-16">
      <div className="mb-10 max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-neutral-50">
          Competitor analysis
        </h1>
        <p className="mt-3 text-neutral-400">
          Describe your company. Get a researched, sourced read on who you are
          up against, where the gaps are, and what the market is raising at.
        </p>
      </div>
      <AnalyzeForm />
    </main>
  )
}
```

- [ ] **Step 3: Update metadata in `app/layout.tsx`**

Set the exported `metadata` object to:

```ts
export const metadata = {
  title: 'Competitor Analysis',
  description: 'Live-researched competitive intelligence for founders.',
}
```

- [ ] **Step 4: Verify it renders**

Run `npm run dev`, open `http://localhost:3000`. Expected: the form renders,
the submit button is disabled until 20 characters are entered, and "Use an
example" fills the textarea.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/layout.tsx components/AnalyzeForm.tsx
git commit -m "feat: add company description input form"
```

---

### Task 12: Live progress component

**Files:**
- Create: `components/RunProgress.tsx`

**Interfaces:**
- Consumes: `GET /api/report/[id]/stream`; `ProgressEvent` type from `lib/db`.
- Produces: `<RunProgress reportId={string} />` — refreshes the route when the run finishes.

- [ ] **Step 1: Write the component**

Create `components/RunProgress.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgressEvent } from '@/lib/db'

const LABEL: Record<string, string> = {
  phase: '',
  search: 'Searching',
  fetch: 'Reading',
  thinking: 'Thinking',
  done: 'Done',
  error: 'Failed',
}

export default function RunProgress({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [events, setEvents] = useState<ProgressEvent[]>([])

  useEffect(() => {
    const es = new EventSource(`/api/report/${reportId}/stream`)

    es.onmessage = (msg) => {
      const data = JSON.parse(msg.data)
      if (data.type === 'progress') {
        setEvents((prev) => [...prev, data.event as ProgressEvent])
      } else if (data.type === 'status') {
        es.close()
        // Re-render the server component, which now sees a terminal status.
        router.refresh()
      }
    }

    // The server closes the stream on completion; without this the browser
    // would reconnect in a loop against a finished report.
    es.onerror = () => es.close()

    return () => es.close()
  }, [reportId, router])

  const current = events[events.length - 1]

  return (
    <div className="mx-auto w-full max-w-2xl py-20">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <h2 className="text-lg font-medium text-neutral-100">
          {current?.kind === 'phase' ? current.detail : 'Researching the market'}
        </h2>
      </div>

      <ol className="mt-8 space-y-2">
        {events
          .filter((e) => e.kind !== 'phase')
          .map((e) => (
            <li
              key={e.id}
              className="flex gap-3 font-mono text-sm text-neutral-500"
            >
              <span className="shrink-0 text-neutral-600">{LABEL[e.kind]}</span>
              <span className="truncate text-neutral-400">{e.detail}</span>
            </li>
          ))}
      </ol>

      {events.length === 0 && (
        <p className="mt-8 text-sm text-neutral-500">Starting up…</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify no server-only import leaked into the client bundle**

`RunProgress` imports a *type* from `lib/db`, which TypeScript erases at
compile time. Confirm the build does not pull `better-sqlite3` into the client:

Run: `npm run build`
Expected: build succeeds with no "Module not found: better-sqlite3" error. If it
fails, change the import to `import type { ProgressEvent } from '@/lib/db'` —
the `type` keyword guarantees erasure.

- [ ] **Step 3: Commit**

```bash
git add components/RunProgress.tsx
git commit -m "feat: add live progress feed component"
```

---

### Task 13: Competitor cards and positioning map

**Files:**
- Create: `components/dashboard/CompetitorCards.tsx`, `components/dashboard/PositioningMap.tsx`

**Interfaces:**
- Consumes: `Competitor`, `Positioning` types from `lib/analysis/schema`.
- Produces: `<CompetitorCards competitors={Competitor[]} />`, `<PositioningMap positioning={Positioning} />`.

- [ ] **Step 1: Write the competitor cards**

Create `components/dashboard/CompetitorCards.tsx`:

```tsx
import type { Competitor } from '@/lib/analysis/schema'

const CATEGORY_STYLE: Record<Competitor['category'], string> = {
  direct: 'bg-red-950 text-red-300 border-red-900',
  adjacent: 'bg-amber-950 text-amber-300 border-amber-900',
  emerging: 'bg-sky-950 text-sky-300 border-sky-900',
}

export default function CompetitorCards({
  competitors,
}: {
  competitors: Competitor[]
}) {
  if (competitors.length === 0) {
    return <p className="text-neutral-500">No competitors were identified.</p>
  }

  const sorted = [...competitors].sort((a, b) => b.overlapScore - a.overlapScore)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sorted.map((c) => (
        <article
          key={c.name}
          className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium text-neutral-100">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
              </h3>
              <p className="mt-1 text-sm text-neutral-400">{c.oneLiner}</p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${CATEGORY_STYLE[c.category]}`}
            >
              {c.category}
            </span>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Overlap</span>
              <span>{c.overlapScore}</span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-neutral-800">
              <div
                className="h-1 rounded-full bg-neutral-400"
                style={{ width: `${Math.min(100, Math.max(0, c.overlapScore))}%` }}
              />
            </div>
          </div>

          <dl className="mt-4 space-y-1.5 text-sm">
            <Row label="Segment" value={c.targetSegment} />
            <Row
              label="Pricing"
              value={
                c.pricing
                  ? [c.pricing.model, c.pricing.entryPrice].filter(Boolean).join(' · ')
                  : null
              }
            />
            <Row
              label="Raised"
              value={
                c.funding
                  ? [c.funding.totalRaised, c.funding.lastRound]
                      .filter(Boolean)
                      .join(' · ')
                  : null
              }
            />
          </dl>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <List title="Strengths" items={c.strengths} tone="text-emerald-400" />
            <List title="Weaknesses" items={c.weaknesses} tone="text-rose-400" />
          </div>

          {c.sources.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-800 pt-3">
              {c.sources.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-300"
                >
                  {s.title}
                </a>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-neutral-500">{label}</dt>
      <dd className={value ? 'text-neutral-300' : 'text-neutral-600'}>
        {value || 'Not found'}
      </dd>
    </div>
  )
}

function List({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: string
}) {
  return (
    <div>
      <p className={`text-xs font-medium ${tone}`}>{title}</p>
      <ul className="mt-1 space-y-1 text-neutral-400">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Write the positioning map**

Create `components/dashboard/PositioningMap.tsx`:

```tsx
'use client'

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
} from 'recharts'
import type { Positioning } from '@/lib/analysis/schema'

export default function PositioningMap({
  positioning,
}: {
  positioning: Positioning
}) {
  const you = positioning.points.filter((p) => p.isYou)
  const them = positioning.points.filter((p) => !p.isYou)

  return (
    <div>
      <p className="mb-4 text-sm text-neutral-400">{positioning.rationale}</p>

      <div className="h-96 w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
            <CartesianGrid stroke="#262626" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              tick={false}
              stroke="#525252"
              label={{
                value: `${positioning.xAxis.lowLabel} → ${positioning.xAxis.highLabel}`,
                position: 'insideBottom',
                offset: -12,
                fill: '#a3a3a3',
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              tick={false}
              stroke="#525252"
              label={{
                value: `${positioning.yAxis.lowLabel} → ${positioning.yAxis.highLabel}`,
                angle: -90,
                position: 'insideLeft',
                fill: '#a3a3a3',
                fontSize: 12,
              }}
            />
            <ZAxis range={[140, 140]} />
            <Scatter data={them} fill="#737373">
              <LabelList dataKey="name" position="top" fill="#a3a3a3" fontSize={11} />
            </Scatter>
            <Scatter data={you} fill="#34d399">
              <LabelList dataKey="name" position="top" fill="#34d399" fontSize={12} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex gap-6 text-xs text-neutral-500">
        <span>
          <strong className="text-neutral-300">X</strong> {positioning.xAxis.label}
        </span>
        <span>
          <strong className="text-neutral-300">Y</strong> {positioning.yAxis.label}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/CompetitorCards.tsx components/dashboard/PositioningMap.tsx
git commit -m "feat: add competitor cards and positioning map panels"
```

---

### Task 14: SWOT, moat, gaps and wedge panels

**Files:**
- Create: `components/dashboard/SwotMoat.tsx`, `components/dashboard/GapsWedge.tsx`

**Interfaces:**
- Consumes: `Swot`, `Moat`, `Gap`, `Wedge` types from `lib/analysis/schema`.
- Produces: `<SwotMoat swot={Swot} moat={Moat} />`, `<GapsWedge gaps={Gap[]} wedge={Wedge} />`.

- [ ] **Step 1: Write the SWOT + moat panel**

Create `components/dashboard/SwotMoat.tsx`:

```tsx
import type { Swot, Moat } from '@/lib/analysis/schema'

const VERDICT_STYLE: Record<Moat['verdict'], string> = {
  strong: 'border-emerald-800 bg-emerald-950/60 text-emerald-300',
  emerging: 'border-sky-800 bg-sky-950/60 text-sky-300',
  weak: 'border-amber-800 bg-amber-950/60 text-amber-300',
  none: 'border-rose-800 bg-rose-950/60 text-rose-300',
}

const VERDICT_COPY: Record<Moat['verdict'], string> = {
  strong: 'Defensible moat',
  emerging: 'Moat forming',
  weak: 'Thin moat',
  none: 'Commodity fight',
}

export default function SwotMoat({ swot, moat }: { swot: Swot; moat: Moat }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Quadrant title="Strengths" items={swot.strengths} tone="text-emerald-400" />
        <Quadrant title="Weaknesses" items={swot.weaknesses} tone="text-rose-400" />
        <Quadrant
          title="Opportunities"
          items={swot.opportunities}
          tone="text-sky-400"
        />
        <Quadrant title="Threats" items={swot.threats} tone="text-amber-400" />
      </div>

      <div className={`rounded-xl border p-5 ${VERDICT_STYLE[moat.verdict]}`}>
        <p className="text-sm font-medium uppercase tracking-wide">
          {VERDICT_COPY[moat.verdict]}
        </p>
        <p className="mt-2 text-neutral-200">{moat.reasoning}</p>
        {moat.defensibilityFactors.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-neutral-300">
            {moat.defensibilityFactors.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Quadrant({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: string
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <h3 className={`text-sm font-medium ${tone}`}>{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">
        {items.length === 0 && <li className="text-neutral-600">Nothing found.</li>}
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Write the gaps + wedge panel**

Create `components/dashboard/GapsWedge.tsx`:

```tsx
import type { Gap, Wedge } from '@/lib/analysis/schema'

export default function GapsWedge({
  gaps,
  wedge,
}: {
  gaps: Gap[]
  wedge: Wedge
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-900 bg-emerald-950/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
          Recommended wedge
        </p>
        <h3 className="mt-2 text-lg font-medium text-neutral-100">
          {wedge.recommendation}
        </h3>
        <p className="mt-2 text-neutral-300">{wedge.rationale}</p>

        <div className="mt-4 rounded-lg border border-emerald-900/70 bg-neutral-950/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            First move
          </p>
          <p className="mt-1 text-neutral-200">{wedge.firstMove}</p>
        </div>

        {wedge.risks.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-500">
              Risks
            </p>
            <ul className="mt-1 space-y-1 text-sm text-neutral-400">
              {wedge.risks.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-neutral-400">Underserved gaps</h3>
        {gaps.length === 0 && (
          <p className="text-neutral-600">No clear gaps were identified.</p>
        )}
        {gaps.map((g) => (
          <div
            key={g.segment}
            className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
          >
            <h4 className="font-medium text-neutral-100">{g.segment}</h4>
            <p className="mt-1 text-neutral-300">{g.unmetNeed}</p>
            <p className="mt-3 text-sm text-neutral-500">
              <span className="text-neutral-400">Why unserved: </span>
              {g.whyUnserved}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              <span className="text-neutral-400">Evidence: </span>
              {g.evidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/SwotMoat.tsx components/dashboard/GapsWedge.tsx
git commit -m "feat: add SWOT/moat and gaps/wedge panels"
```

---

### Task 15: Valuation panel

**Files:**
- Create: `components/dashboard/ValuationPanel.tsx`
- Test: `components/dashboard/__tests__/valuation-format.test.ts`

**Interfaces:**
- Consumes: `Valuation` type from `lib/analysis/schema`; `MIN_COMPARABLES_FOR_RANGE`.
- Produces: `<ValuationPanel valuation={Valuation} />`; helper `formatUsd(n: number | null): string` exported from the same file for testing.

This panel gets its own task and its own tests because it is the one output that
could do real damage if it renders an unsupported number as if it were
researched.

- [ ] **Step 1: Write the failing tests**

Create `components/dashboard/__tests__/valuation-format.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatUsd } from '@/components/dashboard/ValuationPanel'

describe('formatUsd', () => {
  it('renders millions compactly', () => {
    expect(formatUsd(12_000_000)).toBe('$12M')
  })

  it('renders billions compactly', () => {
    expect(formatUsd(2_400_000_000)).toBe('$2.4B')
  })

  it('renders sub-million values with thousands', () => {
    expect(formatUsd(750_000)).toBe('$750K')
  })

  it('renders null as an explicit not-disclosed marker, never as zero', () => {
    expect(formatUsd(null)).toBe('Not disclosed')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/dashboard/__tests__/valuation-format.test.ts`
Expected: FAIL — cannot resolve `@/components/dashboard/ValuationPanel`.

- [ ] **Step 3: Write the component**

Create `components/dashboard/ValuationPanel.tsx`:

```tsx
import {
  MIN_COMPARABLES_FOR_RANGE,
  type Valuation,
} from '@/lib/analysis/schema'

/**
 * A missing number renders as "Not disclosed", never as 0 or an em dash that
 * could be mistaken for a value. Exported for testing.
 */
export function formatUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'Not disclosed'
  if (Math.abs(n) >= 1e9) return `$${trim(n / 1e9)}B`
  if (Math.abs(n) >= 1e6) return `$${trim(n / 1e6)}M`
  if (Math.abs(n) >= 1e3) return `$${trim(n / 1e3)}K`
  return `$${trim(n)}`
}

function trim(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export default function ValuationPanel({
  valuation,
}: {
  valuation: Valuation
}) {
  const { comparables, impliedRange, fundraiseGuidance, caveats } = valuation

  return (
    <div className="space-y-6">
      {impliedRange ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Implied valuation range
          </p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-neutral-100">
              {formatUsd(impliedRange.low)}
            </span>
            <span className="text-neutral-600">to</span>
            <span className="text-3xl font-semibold text-neutral-100">
              {formatUsd(impliedRange.high)}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Midpoint {formatUsd(impliedRange.mid)} · {impliedRange.currency}
          </p>
          <p className="mt-3 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
            <span className="text-neutral-500">Basis: </span>
            {impliedRange.basis}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-6">
          <p className="text-sm font-medium text-amber-300">
            No implied range reported
          </p>
          <p className="mt-2 text-sm text-neutral-300">
            Fewer than {MIN_COMPARABLES_FOR_RANGE} sourced comparables were
            found, so a valuation range is not supportable from this evidence.
            The comparables below are what research actually turned up.
          </p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-neutral-400">
          Comparable rounds ({comparables.length})
        </h3>
        {comparables.length === 0 ? (
          <p className="mt-2 text-neutral-600">
            No sourced comparable rounds were found.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-800">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="p-3 font-medium">Company</th>
                  <th className="p-3 font-medium">Stage</th>
                  <th className="p-3 font-medium">Raised</th>
                  <th className="p-3 font-medium">Post-money</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {comparables.map((c) => (
                  <tr key={`${c.company}-${c.date}`} className="text-neutral-300">
                    <td className="p-3 font-medium text-neutral-100">
                      {c.company}
                    </td>
                    <td className="p-3">{c.roundStage}</td>
                    <td className="p-3">{formatUsd(c.amountRaised)}</td>
                    <td className="p-3">{formatUsd(c.postMoneyValuation)}</td>
                    <td className="p-3 text-neutral-500">{c.date}</td>
                    <td className="p-3">
                      <a
                        href={c.source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
                      >
                        {c.source.title}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Fundraise guidance
        </p>
        <p className="mt-2 text-lg text-neutral-100">
          {fundraiseGuidance.suggestedRaise}{' '}
          <span className="text-neutral-500">
            at {fundraiseGuidance.suggestedStage}
          </span>
        </p>
        {fundraiseGuidance.keyMetricsToHit.length > 0 && (
          <>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Metrics to hit first
            </p>
            <ul className="mt-1 space-y-1 text-sm text-neutral-300">
              {fundraiseGuidance.keyMetricsToHit.map((m) => (
                <li key={m}>· {m}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {caveats.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Caveats
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-400">
            {caveats.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/dashboard/__tests__/valuation-format.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/ValuationPanel.tsx components/dashboard/__tests__
git commit -m "feat: add valuation and fundraise panel"
```

---

### Task 16: Report page and end-to-end wiring

**Files:**
- Create: `app/report/[id]/page.tsx`, `components/dashboard/Section.tsx`

**Interfaces:**
- Consumes: `getReport` from `lib/db`; all five dashboard components; `RunProgress`.
- Produces: the working `/report/[id]` route.

- [ ] **Step 1: Write the section wrapper**

Create `components/dashboard/Section.tsx`:

```tsx
export default function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-neutral-900 py-10">
      <h2 className="text-xl font-medium text-neutral-100">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}
```

- [ ] **Step 2: Write the report page**

Create `app/report/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getReport } from '@/lib/db'
import RunProgress from '@/components/RunProgress'
import Section from '@/components/dashboard/Section'
import CompetitorCards from '@/components/dashboard/CompetitorCards'
import PositioningMap from '@/components/dashboard/PositioningMap'
import SwotMoat from '@/components/dashboard/SwotMoat'
import GapsWedge from '@/components/dashboard/GapsWedge'
import ValuationPanel from '@/components/dashboard/ValuationPanel'

export const dynamic = 'force-dynamic'

const CONFIDENCE_STYLE = {
  high: 'border-emerald-900 text-emerald-400',
  medium: 'border-amber-900 text-amber-400',
  low: 'border-rose-900 text-rose-400',
} as const

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const row = getReport(id)
  if (!row) notFound()

  if (row.status === 'running') {
    return (
      <main className="min-h-screen bg-neutral-950 px-6">
        <RunProgress reportId={id} />
      </main>
    )
  }

  if (row.status === 'failed' || !row.payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6">
        <div className="max-w-lg text-center">
          <h1 className="text-xl font-medium text-neutral-100">
            This analysis did not finish
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            {row.error ?? 'The run ended without producing a report.'}
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-neutral-100 px-5 py-2.5 font-medium text-neutral-900 hover:bg-white"
          >
            Start over
          </a>
        </div>
      </main>
    )
  }

  const r = row.payload

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="pb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-50">
              {r.company.name}
            </h1>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs ${CONFIDENCE_STYLE[r.confidence]}`}
            >
              {r.confidence} confidence
            </span>
          </div>
          <p className="mt-2 text-neutral-400">{r.company.oneLiner}</p>
          <p className="mt-1 text-sm text-neutral-600">
            {r.company.category} · {r.company.inferredStage}
            {row.usage && (
              <>
                {' '}
                · {row.usage.webSearches} searches · ~$
                {row.usage.estimatedTokenCostUsd.toFixed(2)} in tokens
              </>
            )}
          </p>
        </header>

        <Section
          title="Competitors"
          subtitle="Ranked by how directly they compete for your customer."
        >
          <CompetitorCards competitors={r.competitors} />
        </Section>

        <Section
          title="Positioning"
          subtitle="The two dimensions that actually separate this market."
        >
          <PositioningMap positioning={r.positioning} />
        </Section>

        <Section title="SWOT and defensibility">
          <SwotMoat swot={r.swot} moat={r.moat} />
        </Section>

        <Section title="Gaps and wedge">
          <GapsWedge gaps={r.gaps} wedge={r.wedge} />
        </Section>

        <Section
          title="Valuation and fundraise"
          subtitle="Every comparable below is sourced. Rounds that could not be sourced were omitted rather than estimated."
        >
          <ValuationPanel valuation={r.valuation} />
        </Section>

        <Section title="Sources">
          <ul className="space-y-1.5 text-sm">
            {r.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds. If it fails with "Module not found: better-sqlite3",
a client component is importing `lib/db` as a value rather than a type — fix
the import with the `type` keyword.

- [ ] **Step 5: Full end-to-end verification**

```bash
npm run dev
```

In the browser: submit the example description, confirm the progress feed shows
real search queries streaming in, wait for completion, and confirm all six
sections render. Then hard-refresh the report URL and confirm it renders from
persistence rather than re-running.

Check specifically:
- The positioning map highlights your company in green.
- If fewer than 3 sourced comparables were found, the valuation panel shows the
  amber "no implied range" block rather than a number.
- Every comparable row has a working source link.

- [ ] **Step 6: Write the README**

Create `README.md`:

````markdown
# Competitor Analysis

Paste a company description, get a live-researched competitive analysis.

## Setup

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev
```

## How it works

Two Claude Opus 5 calls. Phase 1 researches the live web using Claude's
server-side `web_search` and `web_fetch` tools and produces free-form sourced
notes. Phase 2 reshapes those notes into a Zod-validated payload. Progress is
persisted to SQLite as it runs, so `/report/[id]` streams real search queries
and survives a refresh.

## Cost

Roughly $0.30–$1.00 per report in tokens, plus web search billed separately.
Rate limited to 5 runs per IP per hour — change with `RATE_LIMIT_MAX`.

## Deploying

Two things are local-only by construction:

1. **SQLite.** All SQL lives in `lib/db.ts`. Swap the `Database` construction
   for Turso/libSQL or Postgres.
2. **The detached job** in `app/api/analyze/route.ts`. On serverless this needs
   `waitUntil` or a queue.

## Tests

```bash
npm test
```

Claude is mocked throughout — no test makes a live API call.
````

- [ ] **Step 7: Commit**

```bash
git add app/report components/dashboard/Section.tsx README.md
git commit -m "feat: add report page wiring all five dashboard panels"
```

---

## Self-review

**Spec coverage.** Every spec section maps to a task: stack → 1; two-phase
pipeline → 7, 8; `pause_turn` cap → 7; refusal handling → 6, 7, 8; data contract
→ 2; valuation integrity → 2, 8, 15; job flow and progress → 9, 10, 12;
database → 4; security and cost → 3, 5, 10; file layout → all; testing → 2, 3,
4, 5, 6, 7, 8, 9, 15; deployment notes → 4, 10, 16.

**Deviation recorded.** The spec's "both calls enable fallbacks" is narrowed to
phase 1 only, with the reason documented at the top of this plan and as a code
comment in Task 8.

**Type consistency.** `UsageSummary` uses `estimatedTokenCostUsd` (not
`estimatedCostUsd`) in Tasks 3, 4, 9, and 16. `ProgressKind` values
(`phase`/`search`/`fetch`/`thinking`/`done`/`error`) match between Task 4's type
and Task 12's `LABEL` map. `enforceValuationIntegrity` is defined in Task 2 and
consumed in Task 8. `MIN_COMPARABLES_FOR_RANGE` is used in Tasks 2, 6, and 15.
`getClient` (not `client`) is the exported accessor in Tasks 6, 7, and 8.
