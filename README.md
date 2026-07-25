# Competitor Analysis

Paste a company description, get a live-researched competitive analysis:
competitor profiles, a positioning map, SWOT and moat, gaps and a wedge
strategy, and sourced funding comparables with an implied valuation range.

## Setup

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev
```

## How it works

Two Claude Opus 5 calls.

**Phase 1 — research.** Streams with adaptive thinking at `effort: high` and
Claude's server-side `web_search` / `web_fetch` tools. Produces free-form notes
with inline source URLs. Server-tool loops stop at the server-side iteration
limit with `stop_reason: "pause_turn"`; the runner appends the paused assistant
turn and resumes, capped at 5 continuations. Hitting the cap degrades the
report to `confidence: "low"` rather than failing.

**Phase 2 — structuring.** No tools. Reshapes the notes into a Zod-validated
payload via `messages.parse()`, which retries the model on schema mismatch.

Progress is persisted to SQLite as the run proceeds, so `/report/[id]` streams
the real search queries Claude issues and survives a refresh. A client
disconnect does not cancel the run.

## Valuation integrity

The valuation panel is the one output that could do real damage if it were
wrong — a founder walking into a raise citing an invented comparable. Three
rules are enforced in code, not just in the prompt:

1. Every comparable requires a source URL. Every numeric field on it is
   nullable. The model is told to omit a round it cannot source rather than
   estimate one.
2. The implied range is derived only from the comparables actually listed, and
   always renders with its basis and caveats visible.
3. Fewer than three sourced comparables and the range is `null` — the panel
   says a range is not supportable rather than showing a number.

## Cost

Roughly $0.30–$1.00 per report in tokens, plus web search billed separately.
Actual usage and estimated token cost are recorded per run and shown on the
report. Rate limited to 5 runs per IP per hour — change with `RATE_LIMIT_MAX`.

## Deploying

Two things are local-only by construction, both isolated to one call site:

1. **SQLite.** All SQL lives in `lib/db.ts`. Vercel's filesystem is ephemeral,
   so swap the `Database` construction for Turso/libSQL (same dialect) or
   Postgres.
2. **The detached job** in `app/api/analyze/route.ts`. A floating promise works
   in a long-lived Node process; on serverless it needs `waitUntil` or a queue.

## Tests

```bash
npm test
```

Claude is mocked throughout — no test makes a live API call. Coverage includes
the valuation integrity rules, `pause_turn` resumption, refusal handling, and
the repository round-trip.
