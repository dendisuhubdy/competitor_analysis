# Competitor Analysis — Design

**Date:** 2026-07-25
**Status:** Approved

## Summary

A web app where a founder pastes a company description and receives a deep,
source-backed competitor analysis rendered as a dashboard. Research runs against
the live web through the Claude API. Reports persist and are shareable by URL.

## Goals

- One text input (company description) produces a complete competitive analysis.
- Analysis reflects current reality — funding, pricing, and positioning are
  researched on the live web, not recalled from training data.
- Output renders as five insight panels aimed at a startup founder making
  decisions about where to compete and what to raise.
- Reports persist to a stable URL that survives refresh and can be sent to a
  cofounder.

## Non-goals

- Authentication, accounts, or multi-tenancy.
- Continuous monitoring, alerting, or scheduled re-runs.
- Editing or annotating a generated report.
- Deployment. The app runs locally and is structured so deployment is a small,
  contained change (see Deployment notes).

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15, App Router, TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts (positioning scatter) |
| Persistence | SQLite via `better-sqlite3` |
| Schema / validation | Zod, shared between Claude and the UI |
| LLM | `@anthropic-ai/sdk`, model `claude-opus-5` |

## Analysis pipeline

Two Claude calls. Splitting research from structuring is deliberate: forcing a
strict output schema onto a long server-tool loop is the failure mode these
pipelines usually hit. Research runs free-form; a second cheap call shapes it.

### Phase 1 — Research

```
model:         claude-opus-5
thinking:      { type: "adaptive", display: "summarized" }
output_config: { effort: "high" }
max_tokens:    64000  (streaming)
tools:         web_search_20260209, web_fetch_20260209
```

Streaming is required at this `max_tokens` to avoid SDK HTTP timeouts. Output is
free-form research notes carrying source URLs inline.

**`pause_turn` handling.** Server-tool loops stop at the server-side iteration
limit with `stop_reason: "pause_turn"`. The runner appends the paused assistant
turn and re-sends to resume. Capped at **5 continuations**; on exhaustion the run
proceeds to Phase 2 with whatever research completed and the report is marked
`confidence: "low"`.

**Do not declare the `code_execution` tool.** The `_20260209` web tool variants
have dynamic filtering built in; a second execution environment confuses the
model.

### Phase 2 — Structuring

```
model:         claude-opus-5
thinking:      { type: "adaptive" }
output_config: { effort: "medium", format: zodOutputFormat(ReportSchema) }
tools:         none
```

Consumes Phase 1 notes, emits the dashboard JSON. Uses `client.messages.parse()`
so the SDK validates the response against the schema and the model retries on
mismatch.

### Refusal handling

Both calls check `stop_reason` **before** reading `content`, and enable
server-side fallbacks:

```
betas:     ["server-side-fallback-2026-07-01"]
fallbacks: "default"
```

Competitor research is benign and should not trip safety classifiers, but a
silent empty `content` array is a worse failure than a handled one. A refusal
that survives the fallback marks the report `failed` with the refusal category
surfaced to the user.

## Data contract

One Zod schema in `lib/analysis/schema.ts` is the single source of truth: it
generates the JSON schema sent to Claude and types every dashboard component.

```ts
Report = {
  company:     { name, oneLiner, category, inferredStage }
  competitors: Competitor[]
  positioning: Positioning
  swot:        Swot
  moat:        Moat
  gaps:        Gap[]
  wedge:       Wedge
  valuation:   Valuation
  sources:     Source[]        // deduped union of every URL cited
  confidence:  "high" | "medium" | "low"
}

Competitor = {
  name, url, oneLiner
  category:     "direct" | "adjacent" | "emerging"
  overlapScore: number          // 0-100, how directly it competes
  funding:      { totalRaised, lastRound, lastRoundDate, investors[] } | null
  pricing:      { model, entryPrice, notes } | null
  targetSegment: string
  strengths:    string[]
  weaknesses:   string[]
  sources:      Source[]
}

Positioning = {
  xAxis:  { label, lowLabel, highLabel }   // axes chosen per-market by Claude
  yAxis:  { label, lowLabel, highLabel }
  points: { name, x, y, isYou }[]          // x,y in 0-100
  rationale: string                        // why these two axes
}

Moat = {
  verdict:              "strong" | "emerging" | "weak" | "none"
  reasoning:            string
  defensibilityFactors: string[]
}

Gap = { segment, unmetNeed, whyUnserved, evidence }

Wedge = { recommendation, rationale, firstMove, risks[] }

Valuation = {
  comparables:  Comparable[]
  impliedRange: { low, mid, high, currency, basis } | null
  fundraiseGuidance: { suggestedRaise, suggestedStage, keyMetricsToHit[] }
  caveats:      string[]
}

Comparable = {
  company, roundStage, date
  amountRaised:        number | null
  postMoneyValuation:  number | null
  revenueMultiple:     number | null
  source:              Source        // REQUIRED — never nullable
}
```

Structured outputs do not support numeric or string constraints (`minimum`,
`minLength`, etc.). The Zod schema may declare them; the SDK strips them from
the JSON schema sent to Claude and validates client-side.

### Valuation integrity rules

This is the one panel where fabrication is genuinely harmful — a founder walking
into a raise citing an invented comparable. Three enforced rules:

1. `Comparable.source` is **required and non-nullable**. Every numeric field on a
   comparable is nullable. The prompt instructs the model to omit a comparable it
   cannot source rather than estimate one.
2. `impliedRange` is derived **only** from the comparables actually listed, and
   renders with its `basis` string and `caveats` visible — never as a bare
   number.
3. If fewer than **3** sourced comparables are found, `impliedRange` is `null`.
   The panel renders the comparables it did find and states plainly that a range
   is not supportable from this evidence.

## Job flow and progress

```
POST /api/analyze
  → validate + rate-limit
  → INSERT report row (status: "running")
  → kick off pipeline detached (floating promise, writes progress to SQLite)
  → 200 { id }

client navigates to /report/[id]

GET /api/report/[id]/stream   (SSE, read-only)
  → replays persisted progress events, then tails new ones
  → terminal event carries status: "done" | "failed"

GET /report/[id]              (server component)
  → status "running" → render <RunProgress> which opens the SSE stream
  → status "done"    → render the dashboard from the persisted payload
  → status "failed"  → render the error with a retry action
```

Progress steps are derived from **real** stream events, not simulated. Each
`server_tool_use` block carries the actual query, so the user sees
`Searching: "Perplexity pricing tiers 2026"` rather than a generic spinner.
Phase transitions and the Phase 2 start emit their own steps.

Because progress is persisted rather than held in memory, a refresh mid-run
reattaches to a run already in flight, and a client disconnect does not cancel
it.

## Database

```sql
CREATE TABLE reports (
  id           TEXT PRIMARY KEY,      -- nanoid, URL-safe
  input        TEXT NOT NULL,         -- the company description
  status       TEXT NOT NULL,         -- running | done | failed
  payload      TEXT,                  -- JSON, the validated Report
  error        TEXT,
  usage        TEXT,                  -- JSON: tokens + estimated cost
  created_at   INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE progress_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id  TEXT NOT NULL REFERENCES reports(id),
  phase      TEXT NOT NULL,           -- research | structuring
  kind       TEXT NOT NULL,           -- search | fetch | thinking | phase | done | error
  detail     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  ip         TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

All access goes through `lib/db.ts`, which exports a narrow repository interface
(`createReport`, `appendProgress`, `getReport`, `listProgressSince`,
`finishReport`, `failReport`, `checkRateLimit`). No SQL outside that module — it
is the seam that makes the deployment swap a single-file change.

## Security and cost

- `ANTHROPIC_API_KEY` is read server-side only and never reaches the browser.
  No client component imports the Anthropic SDK.
- Rate limit: **5 runs per IP per hour**, enforced in SQLite. Configurable via
  env. The key is server-side and every run costs real money, so this is not
  optional.
- Input capped at 4,000 characters.
- Estimated cost per report: roughly **$0.30–$1.00** (Opus 5 at $5/$25 per MTok
  plus web search). Actual token usage and estimated cost are recorded per run
  and shown in the UI.

## File layout

```
app/
  page.tsx                        input form
  report/[id]/page.tsx            dashboard (server component)
  api/analyze/route.ts            POST — create + kick off
  api/report/[id]/stream/route.ts GET  — SSE progress
components/
  RunProgress.tsx                 live progress, SSE client
  dashboard/
    CompetitorCards.tsx
    PositioningMap.tsx
    SwotMoat.tsx
    GapsWedge.tsx
    ValuationPanel.tsx
lib/
  claude.ts                       client construction + model config
  db.ts                           SQLite repository (the only SQL in the app)
  ratelimit.ts
  cost.ts                         usage → estimated cost
  analysis/
    schema.ts                     Zod schema — single source of truth
    prompts.ts                    research + structuring prompts
    research.ts                   phase 1
    structure.ts                  phase 2
    run.ts                        orchestrator, progress emission
```

Each module has one job and a small surface. `run.ts` is the only place that
knows about both phases; the phase modules do not know about the database, and
the dashboard components do not know about Claude.

## Testing

- **Schema**: fixture payloads parse; malformed payloads are rejected with a
  useful error.
- **Valuation rules**: fewer than 3 sourced comparables ⇒ `impliedRange` is
  `null`; a comparable missing `source` fails validation.
- **`pause_turn`**: a mocked client returning `pause_turn` resumes and terminates
  at the continuation cap.
- **Refusal**: a mocked `stop_reason: "refusal"` marks the report `failed`
  without throwing.
- **Repository**: create → append progress → finish round-trips; rate limit
  allows N then blocks.
- **Progress derivation**: a recorded stream event fixture produces the expected
  progress steps.

Claude is mocked in all tests. No test makes a live API call.

## Deployment notes

Two things are local-only by construction, both intentionally isolated:

1. **SQLite.** Vercel's filesystem is ephemeral, so `better-sqlite3` works
   locally but not on a serverless deploy. `lib/db.ts` is the only module with
   SQL; switching to Turso/libSQL (same SQL dialect, drop-in) or Postgres is a
   single-file change.
2. **Detached background job.** The floating promise in `/api/analyze` works in a
   long-lived Node process. On serverless it needs `waitUntil` or a queue.
   Isolated to `run.ts`'s call site.

Both are documented as comments at the relevant call sites rather than
pre-abstracted for infrastructure that may never be used.

## Open risks

- **Web research quality varies by market.** Obscure or pre-launch markets yield
  thin results. Mitigated by the `confidence` field and by rendering panels with
  what was actually found rather than padding.
- **Run latency is 60–120s.** Mitigated by real, specific progress steps and by
  persistence, so the wait is never wasted.
