# Public Landing Page — Design

**Date:** 2026-07-25
**Status:** Approved

## Summary

`checkcompetition.org` currently shows a password box and nothing else. Every
path is gated by `proxy.ts`, so a first-time visitor cannot learn what the site
does before being asked for a credential they do not have.

This adds a public landing page at `/` and a public sample report at `/sample`,
and moves the analyze form behind the gate at `/analyze`. The landing page
proves the product by rendering a real report through the real dashboard
components, rather than describing it.

## Goals

- A visitor with no password can understand what the product does and see its
  actual output.
- The sample shown is genuine and cannot drift from the product — it is the
  stored payload of a real run, rendered by the same components the app uses.
- The differentiator (sourced comparables, and a refusal to show a valuation
  range that the evidence does not support) is the centrepiece, not a footnote.
- The cost and duration of a run are stated plainly, so the password gate reads
  as a deliberate constraint rather than an obstacle.
- No route that spends money becomes publicly reachable.

## Non-goals

- Signup, waitlist, payment, or any form of self-serve access. The password gate
  stays exactly as it is.
- Analytics, cookie banners, or third-party embeds.
- A blog, docs site, or changelog.
- Redesigning the report dashboard. Its components are reused as-is.

## Routes

| Path | Access | Change |
| --- | --- | --- |
| `/` | public | new landing page |
| `/sample` | public | full sample report, rendered from a fixture |
| `/analyze` | gated | today's `/` moves here unchanged |
| `/login` | public | unchanged; default post-login target becomes `/analyze` |
| `/report/[id]` | gated | unchanged; "Start over" retargets to `/analyze` |
| `/api/*` | gated | unchanged |

### Gate changes

`proxy.ts` gains a `PUBLIC_PATHS` set containing `/`, `/sample`, `/login` and
`/api/login`, replacing the current two-path special case. Everything else keeps
today's behaviour: HTML routes redirect to `/login` with a `next` parameter, API
routes return 401 JSON.

The security posture is unchanged in the way that matters: `/api/analyze` — the
only route that spends money — remains gated. What becomes public is static
marketing content and one stored report.

## The sample fixture

A completed run already exists in the local database (`rxYrnGVYlC1i`): the
legal-AI-notetaker example, 18 competitors, 38 sources, 9 sourced comparable
rounds, `impliedRange: null`. It describes a hypothetical company taken from the
form's own example text, so nothing in it is private.

Its payload is extracted to `lib/sample/report.json` and exposed by
`lib/sample/index.ts`, which parses it through `ReportSchema` at module load.

Parsing rather than casting is the point. If a future change to `ReportSchema`
makes the fixture invalid, the import throws and the build fails, instead of the
landing page quietly rendering a shape the product no longer produces. A test
asserts the parse succeeds.

The landing page and `/sample` render this data through the existing
`PositioningMap`, `CompetitorCards` and `ValuationPanel` components. The sample
cannot drift from the product because it is not a copy of the product.

## Page structure

Dark editorial: the app's existing `neutral-950` palette, with typographic
hierarchy and hairline rules doing the work that a SaaS site would give to
gradients and cards.

1. **Nav** — wordmark, link to `/sample`, primary CTA to `/analyze`.
2. **Hero** — oversized serif headline, subhead, two CTAs, and a one-line
   statement of what a run costs in time.
3. **The refusal** — three figures from the sample (38 sources, 9 sourced
   comparable rounds, 0 disclosed post-money valuations) above the real
   `ValuationPanel` "No implied range reported" card. The strongest claim the
   product can make, shown working rather than asserted.
4. **Sample slice** — the real positioning map and three competitor cards in a
   bordered frame, linking to the full report at `/sample`.
5. **How it works** — research, structure, report. Numbered, hairline-ruled.
6. **What's in a report** — six compact items matching the dashboard sections.
7. **Honest band** — cost per run, duration, and why access is gated. Closing
   CTA.
8. **Footer.**

### Visual language

- **Type.** One display serif (Instrument Serif) via `next/font/google` for the
  headline and section headings. Geist Sans keeps everything else. Geist is
  already fetched at build time, so this adds no new build-time dependency
  class.
- **Colour.** No new vocabulary is introduced. Emerald already means
  "verified / high confidence" in the report dashboard, so it becomes the
  sourcing accent. Amber already means "caveat" and stays that way. Everything
  else is neutral.
- **Responsive.** Sections stack on narrow viewports. The positioning map is a
  Recharts `ResponsiveContainer` and already adapts.

## Metadata

`app/layout.tsx` gains a `metadataBase` and OpenGraph/Twitter title and
description, so a shared link renders with something other than a bare URL. The
landing page becomes the first page on this site worth linking to, which is what
makes this worth doing now.

## Corrections in scope

Two existing inconsistencies are touched by this work and fixed with it:

1. `AnalyzeForm` tells the user a run "Takes 1–2 minutes". A measured run takes
   10–15. The landing page states duration, so both must agree, and the correct
   number is the measured one.
2. `/report/[id]`'s failure state links "Start over" to `/`, which is now a
   marketing page. It retargets to `/analyze`.

## Testing

- The sample fixture parses against `ReportSchema`.
- `proxy.ts` allows the public paths without a session cookie, and continues to
  redirect gated HTML routes and 401 gated API routes.

Existing tests must continue to pass. Claude stays mocked; nothing here makes a
live API call.

## Deployment

Unchanged from `DEPLOY.md`: push to `main`, then on the droplet `git pull` and
`docker compose up -d --build`. The `reports` volume is untouched.

Post-deploy verification, without a session cookie:

- `/` returns 200 and renders the landing page.
- `/sample` returns 200.
- `/analyze` redirects to `/login`.
- `/api/analyze` returns 401.

## Risks

**The front page becomes world-readable and crawlable for the first time.** That
is the intent, but it is a real change in exposure: the sample report's sources,
competitor names and analysis become public. The report concerns a hypothetical
company from the form's example text, so there is nothing confidential in it.

**A misconfigured allowlist could expose a gated route.** Mitigated by testing
the proxy directly and by verifying all four routes above after deploy.
