# Public Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `checkcompetition.org` a public landing page at `/` and a public sample report at `/sample`, moving the analyze form behind the password gate at `/analyze`.

**Architecture:** The landing page proves the product by rendering a real stored report through the same dashboard components the app uses, so the sample cannot drift. The report payload is extracted to a JSON fixture that is *parsed* through `ReportSchema` at import — a schema change breaks the build rather than rendering a stale shape. `proxy.ts` gains a public-path allowlist; every money-spending route stays gated.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Zod v4, Recharts, Vitest, `better-sqlite3`.

## Global Constraints

- **This is Next.js 16, not the Next.js in your training data.** Read the relevant guide under `node_modules/next/dist/docs/` before writing routing or middleware code. Heed deprecation notices.
- The middleware file is `proxy.ts` exporting `proxy()`, **not** `middleware.ts`. The `runtime` config option throws if set — do not add one.
- Tests live in `__tests__/` directories and must be `.ts`, never `.tsx`. Vitest's include pattern is `**/__tests__/**/*.test.ts` with `environment: 'node'`, so React component files cannot be unit-tested here. Do not add a jsdom environment.
- The `@` path alias resolves to the repo root.
- No test may make a live Claude API call.
- Tailwind v4: theme tokens are declared in `@theme inline { }` inside `app/globals.css`. There is no `tailwind.config.js`.
- Colour vocabulary is fixed: **emerald** = verified/sourced/high confidence, **amber** = caveat, everything else neutral. Introduce no new accent colour.
- Every number shown on the landing page must be *derived* from the fixture at build time, never typed in as a literal.
- Commit after every task. Push to `main` — this repo lands work on `main` step by step, it does not batch.

---

### Task 1: Sample report fixture

Extract the one completed report from the local SQLite database into a version-controlled fixture, and expose it parsed and validated.

**Files:**
- Create: `lib/sample/report.json`
- Create: `lib/sample/index.ts`
- Test: `lib/sample/__tests__/sample.test.ts`

**Interfaces:**
- Consumes: `ReportSchema`, `Report` from `@/lib/analysis/schema`
- Produces:
  - `sampleReport: Report`
  - `sampleStats: { sources: number; competitors: number; comparables: number; comparablesWithDisclosedValuation: number; comparablesWithoutDisclosedValuation: number; hasImpliedRange: boolean }`
  - `SAMPLE_LEAD_CAVEAT: string` — the report's own first valuation caveat, verbatim

- [ ] **Step 1: Extract the payload from SQLite**

Report `rxYrnGVYlC1i` is the only completed run. Write it out pretty-printed so the diff is reviewable:

```bash
mkdir -p lib/sample
node -e "
const d = require('better-sqlite3')('data/reports.db');
const row = d.prepare('SELECT payload FROM reports WHERE id = ?').get('rxYrnGVYlC1i');
if (!row) throw new Error('sample report rxYrnGVYlC1i not found');
require('node:fs').writeFileSync(
  'lib/sample/report.json',
  JSON.stringify(JSON.parse(row.payload), null, 2) + '\n'
);
"
```

Verify it landed:

```bash
node -e "const r=require('./lib/sample/report.json');console.log(r.company.name, r.competitors.length, r.sources.length, r.valuation.comparables.length)"
```

Expected: `Unnamed AI legal meeting notetaker (pre-seed) 18 38 9`

- [ ] **Step 2: Write the failing test**

Create `lib/sample/__tests__/sample.test.ts`:

```ts
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
    expect(sampleReport.valuation.comparables.every((c) => c.source.url.length > 0)).toBe(true)
  })

  it('exposes the report own leading caveat for quoting', () => {
    expect(SAMPLE_LEAD_CAVEAT).toBe(sampleReport.valuation.caveats[0])
    expect(SAMPLE_LEAD_CAVEAT.length).toBeGreaterThan(40)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/sample/__tests__/sample.test.ts`
Expected: FAIL — cannot resolve `@/lib/sample`.

- [ ] **Step 4: Write the fixture module**

Create `lib/sample/index.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/sample/__tests__/sample.test.ts`
Expected: PASS, 4 tests.

If the JSON import errors under TypeScript, confirm `resolveJsonModule` is enabled in `tsconfig.json`; Next.js's base config enables it, so this should already work.

- [ ] **Step 6: Confirm the derived figures**

Run:

```bash
npx tsx -e "import {sampleStats} from './lib/sample'; console.log(sampleStats)" 2>/dev/null || npx vitest run lib/sample/__tests__/sample.test.ts --reporter=verbose
```

Expected `sampleStats`: `sources: 38`, `competitors: 18`, `comparables: 9`, `comparablesWithDisclosedValuation: 2`, `comparablesWithoutDisclosedValuation: 7`, `hasImpliedRange: false`.

- [ ] **Step 7: Commit and push**

```bash
git add lib/sample
git commit -m "feat: add the sample report fixture, parsed against ReportSchema"
git push origin main
```

---

### Task 2: Route split and the public-path allowlist

Move the analyze form to `/analyze`, open `/` and `/sample` to the public, and retarget every link that assumed `/` was the app.

**Files:**
- Create: `app/analyze/page.tsx`
- Modify: `proxy.ts:15-49`
- Modify: `components/LoginForm.tsx` (the `target` fallback)
- Modify: `app/report/[id]/page.tsx` (the "Start over" link)
- Modify: `components/AnalyzeForm.tsx` (the duration copy)
- Test: `lib/__tests__/proxy.test.ts`

**Interfaces:**
- Consumes: `sitePassword`, `issueSession`, `SESSION_COOKIE` from `@/lib/auth`
- Produces: `/analyze` as the authenticated entry point. Every later task links there.

Note: `app/page.tsx` is *not* touched in this task — Task 4 replaces it. Until then `/` still renders the old form; that is fine and the branch stays green.

- [ ] **Step 1: Write the failing proxy test**

`next/server` and `proxy.ts` import cleanly under Vitest's node environment — this has been verified, so no jsdom or mocking is needed.

Create `lib/__tests__/proxy.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { SESSION_COOKIE, issueSession } from '@/lib/auth'

const PASSWORD = 'test-password'

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(`https://checkcompetition.org${path}`)
  if (cookie) req.cookies.set(SESSION_COOKIE, cookie)
  return req
}

describe('proxy gate', () => {
  beforeEach(() => {
    process.env.SITE_PASSWORD = PASSWORD
  })
  afterEach(() => {
    delete process.env.SITE_PASSWORD
  })

  it('serves the landing page to a visitor with no session', async () => {
    const res = await proxy(request('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('serves the sample report to a visitor with no session', async () => {
    const res = await proxy(request('/sample'))
    expect(res.status).toBe(200)
  })

  it('still serves the login page itself', async () => {
    const res = await proxy(request('/login'))
    expect(res.status).toBe(200)
  })

  it('sends an unauthenticated visitor from /analyze to the login page', async () => {
    const res = await proxy(request('/analyze'))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('next')).toBe('/analyze')
  })

  it('keeps the route that spends money gated', async () => {
    const res = await proxy(request('/api/analyze'))
    expect(res.status).toBe(401)
  })

  it('keeps stored reports gated', async () => {
    const res = await proxy(request('/report/abc123'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('lets a valid session through to /analyze', async () => {
    const res = await proxy(request('/analyze', await issueSession(PASSWORD)))
    expect(res.status).toBe(200)
  })

  it('does not treat a path merely prefixed with a public path as public', async () => {
    const res = await proxy(request('/sample-not-really'))
    expect(res.status).toBe(307)
  })

  it('leaves everything open when no password is configured', async () => {
    delete process.env.SITE_PASSWORD
    const res = await proxy(request('/analyze'))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/__tests__/proxy.test.ts`
Expected: FAIL — the `/` and `/sample` cases get 307 redirects, because `/` currently redirects to `/login` and `/sample` is not exempt.

- [ ] **Step 3: Add the allowlist to the proxy**

In `proxy.ts`, replace the hardcoded two-path exemption with a set. Add above the `proxy` function:

```ts
/**
 * Reachable without a session.
 *
 * `/` and `/sample` are the public face of the site: a visitor has to be able
 * to see what this is before being asked for a password they may not have.
 * `/login` and `/api/login` must stay open or there is no way in.
 *
 * Nothing that spends money is listed here. `/api/analyze` is the route that
 * costs ~$7 a call and it is deliberately absent — matched exactly, so a path
 * that merely starts with a public path is not itself public.
 */
const PUBLIC_PATHS = new Set(['/', '/sample', '/login', '/api/login'])
```

Then replace the existing exemption block:

```ts
  const { pathname, search } = request.nextUrl

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  // API callers get a status code they can act on. Redirecting an unauthorised
  // fetch to an HTML login page would surface as a JSON parse error instead.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  const login = new URL('/login', request.url)
  // Send the visitor back where they were aiming once they are through.
  login.searchParams.set('next', `${pathname}${search}`)
  return NextResponse.redirect(login)
```

The old code guarded `if (pathname !== '/')` before setting `next`, because `/` was the app's home. `/` is now public and never reaches this line, so the guard is dead and is removed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/__tests__/proxy.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Move the analyze form to its own route**

Create `app/analyze/page.tsx` with the content that is in `app/page.tsx` today:

```tsx
import AnalyzeForm from '@/components/AnalyzeForm'

export const metadata = {
  title: 'Run an analysis · Competitor Analysis',
}

export default function AnalyzePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-16">
      <div className="mb-10 max-w-2xl text-center">
        <h1 className="font-serif text-4xl tracking-tight text-neutral-50">
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

(`font-serif` resolves to the site sans-serif until Task 3 registers the display face; it does not error.)

- [ ] **Step 6: Retarget the links that assumed `/` was the app**

In `components/LoginForm.tsx`, the post-login fallback currently sends a visitor to `/`, which is about to become marketing. Change the fallback and its comment:

```tsx
      // Only accept a same-origin relative path — a raw `next` value would let
      // a crafted link bounce an authenticated visitor to another site.
      // With no usable `next`, land on the app rather than the public page they
      // have already read.
      const next = params.get('next')
      const target = next && next.startsWith('/') && !next.startsWith('//')
        ? next
        : '/analyze'
```

In `app/report/[id]/page.tsx`, the failed-run state links "Start over" to `/`:

```tsx
          <a
            href="/analyze"
            className="mt-6 inline-block rounded-lg bg-neutral-100 px-5 py-2.5 font-medium text-neutral-900 hover:bg-white"
          >
            Start over
          </a>
```

- [ ] **Step 7: Correct the run-duration copy**

`components/AnalyzeForm.tsx` promises 1–2 minutes. `README.md` records a measured run at ~11 minutes and `DEPLOY.md` says 10–15. The landing page will state a duration, so these have to agree on the measured figure:

```tsx
      <p className="mt-3 text-center text-xs text-neutral-500">
        Researches the live web. Takes 10–15 minutes — the page streams progress
        and survives a refresh.
      </p>
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, all files including the new proxy and sample tests.

- [ ] **Step 9: Commit and push**

```bash
git add proxy.ts app/analyze components/LoginForm.tsx components/AnalyzeForm.tsx app/report lib/__tests__/proxy.test.ts
git commit -m "feat: move the analyze form to /analyze behind a public-path allowlist"
git push origin main
```

---

### Task 3: Typography, metadata, and shared chrome

Register the display serif, fix the font bug that has been overriding Geist since the project started, set shareable metadata, and build the three primitives every landing section uses.

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Create: `components/landing/Cta.tsx`
- Create: `components/landing/Nav.tsx`
- Create: `components/landing/Footer.tsx`

**Interfaces:**
- Produces:
  - `Cta({ href, children, variant?: 'primary' | 'ghost', className? })` — default export
  - `Nav()` — default export
  - `Footer()` — default export
  - CSS: `font-serif` resolves to Instrument Serif; `font-sans` resolves to Geist Sans

- [ ] **Step 1: Load the display serif and set metadata**

Replace `app/layout.tsx` entirely:

```tsx
import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * One display face, used for headlines only. Instrument Serif ships a single
 * weight, which is the point: there is no weight axis to misuse.
 */
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
})

const DESCRIPTION =
  'Describe your company and get a researched competitive analysis — competitor profiles, positioning, gaps, and sourced funding comparables. Every number carries a URL, or it is not shown.'

export const metadata: Metadata = {
  metadataBase: new URL('https://checkcompetition.org'),
  title: {
    default: 'Competitor analysis that cites its sources',
    template: '%s',
  },
  description: DESCRIPTION,
  openGraph: {
    title: 'Competitor analysis that cites its sources',
    description: DESCRIPTION,
    url: '/',
    siteName: 'checkcompetition',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Competitor analysis that cites its sources',
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-950">{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Register the font tokens and fix the Arial override**

In `app/globals.css`, add the serif token to the theme block and fix the body rule. `body` currently declares `font-family: Arial, Helvetica, sans-serif`, which has been overriding the Geist font the layout loads — the site has never rendered in its intended typeface.

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-serif: var(--font-instrument-serif);
}
```

and

```css
body {
  background: var(--background);
  color: var(--foreground);
  /* Was `Arial, Helvetica, sans-serif`, which silently overrode the Geist
     font `layout.tsx` loads. */
  font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
}
```

- [ ] **Step 3: Verify the fonts resolve**

Run: `npm run dev` and open `http://localhost:3000/analyze`.
Expected: the heading renders in a serif face; body text is Geist, not Arial. Stop the dev server.

- [ ] **Step 4: Build the call-to-action primitive**

Create `components/landing/Cta.tsx`. Three sections need this button, so it exists once:

```tsx
import Link from 'next/link'

const BASE =
  'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition'

const VARIANTS = {
  primary: 'bg-neutral-100 text-neutral-900 hover:bg-white',
  ghost:
    'border border-neutral-800 text-neutral-300 hover:border-neutral-600 hover:text-neutral-50',
} as const

export default function Cta({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string
  children: React.ReactNode
  variant?: keyof typeof VARIANTS
  className?: string
}) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  )
}
```

- [ ] **Step 5: Build the nav**

Create `components/landing/Nav.tsx`:

```tsx
import Link from 'next/link'
import Cta from './Cta'

export default function Nav() {
  return (
    <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
      <Link
        href="/"
        className="font-mono text-sm tracking-tight text-neutral-300 hover:text-neutral-50"
      >
        checkcompetition
      </Link>
      <div className="flex items-center gap-5">
        <Link
          href="/sample"
          className="text-sm text-neutral-400 transition hover:text-neutral-100"
        >
          Sample report
        </Link>
        <Cta href="/analyze">Run an analysis</Cta>
      </div>
    </nav>
  )
}
```

- [ ] **Step 6: Build the footer**

Create `components/landing/Footer.tsx`:

```tsx
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-neutral-900">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-10">
        <p className="font-mono text-xs text-neutral-600">
          checkcompetition.org
        </p>
        <div className="flex gap-5 text-xs text-neutral-500">
          <Link href="/sample" className="hover:text-neutral-300">
            Sample report
          </Link>
          <Link href="/analyze" className="hover:text-neutral-300">
            Run an analysis
          </Link>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 7: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds. Nothing imports the new components yet, so this is a compile check only.

- [ ] **Step 8: Commit and push**

```bash
git add app/layout.tsx app/globals.css components/landing
git commit -m "feat: add display serif, shareable metadata, and landing chrome

The body rule had been overriding Geist with Arial since the project
started, so the site has never rendered in its intended typeface."
git push origin main
```

---

### Task 4: The landing page

Five content sections composed into `app/page.tsx`. Every figure comes from `sampleStats`; nothing is typed in.

**Files:**
- Create: `components/landing/Hero.tsx`
- Create: `components/landing/SourcedProof.tsx`
- Create: `components/landing/SampleSlice.tsx`
- Create: `components/landing/HowItWorks.tsx`
- Create: `components/landing/CostBand.tsx`
- Modify: `app/page.tsx` (replaced entirely)

**Interfaces:**
- Consumes: `sampleReport`, `sampleStats`, `SAMPLE_LEAD_CAVEAT` from `@/lib/sample`; `Cta`, `Nav`, `Footer` from `@/components/landing/*`; `PositioningMap`, `CompetitorCards` from `@/components/dashboard/*`
- Produces: `Hero()`, `SourcedProof()`, `SampleSlice()`, `HowItWorks()`, `CostBand()` — all default exports taking no props

- [ ] **Step 1: Build the hero**

Create `components/landing/Hero.tsx`:

```tsx
import Cta from './Cta'
import { sampleStats } from '@/lib/sample'

export default function Hero() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-24 pt-14 md:pt-24">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-500">
        Live web research · every claim sourced
      </p>

      <h1 className="mt-7 font-serif text-5xl leading-[1.05] tracking-tight text-neutral-50 md:text-7xl">
        Competitor analysis
        <br />
        that cites its sources.
      </h1>

      <p className="mt-7 max-w-xl text-lg leading-relaxed text-neutral-400">
        Describe your company. Get a researched read on who you are up against,
        where the gaps are, and what the market is actually raising at — with a
        URL behind every number, or no number at all.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Cta href="/analyze">Run an analysis →</Cta>
        <Cta href="/sample" variant="ghost">
          Read a real report
        </Cta>
      </div>

      <p className="mt-8 font-mono text-xs text-neutral-600">
        {sampleStats.competitors} competitors · {sampleStats.sources} sources ·
        one run, 10–15 minutes
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Build the proof section**

Create `components/landing/SourcedProof.tsx`. This is the centrepiece: it shows the product declining to produce a number it cannot support, in the report's own words.

```tsx
import Link from 'next/link'
import { sampleStats, SAMPLE_LEAD_CAVEAT } from '@/lib/sample'

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-t border-neutral-800 pt-4">
      <p className="font-serif text-4xl text-neutral-50">{value}</p>
      <p className="mt-2 text-sm leading-snug text-neutral-500">{label}</p>
    </div>
  )
}

export default function SourcedProof() {
  return (
    <section className="border-t border-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-24">
        <h2 className="max-w-2xl font-serif text-3xl leading-tight text-neutral-50 md:text-4xl">
          The number it refuses to give you
        </h2>

        <p className="mt-6 max-w-2xl leading-relaxed text-neutral-400">
          A founder who walks into a raise quoting an invented comparable is
          worse off than one who quotes nothing. So the valuation panel is
          governed by rules enforced in code, not by a prompt: every comparable
          needs a source URL, every figure on it is allowed to be missing, and a
          range is derived only from what research actually found.
        </p>

        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          <Stat
            value={String(sampleStats.comparables)}
            label="comparable rounds found on the sample report, every one with a source URL"
          />
          <Stat
            value={String(sampleStats.comparablesWithoutDisclosedValuation)}
            label="of them disclosed no valuation at all — and were left blank rather than filled in"
          />
          <Stat
            value="None"
            label="implied valuation range reported, because the evidence does not support one"
          />
        </div>

        <figure className="mt-12 border-l-2 border-amber-800/70 bg-amber-950/10 py-2 pl-6">
          <blockquote className="max-w-3xl text-[15px] leading-relaxed text-neutral-300">
            {SAMPLE_LEAD_CAVEAT}
          </blockquote>
          <figcaption className="mt-3 font-mono text-xs text-neutral-600">
            — verbatim, from the sample report&rsquo;s valuation caveats
          </figcaption>
        </figure>

        <p className="mt-10 max-w-2xl leading-relaxed text-neutral-400">
          That is the product working, not failing. A tool that always returns a
          range is telling you something about the tool, not the market.{' '}
          <Link
            href="/sample"
            className="text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
          >
            See the full valuation panel
          </Link>
          .
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Build the sample slice**

Create `components/landing/SampleSlice.tsx`. It renders the *actual* dashboard components against the *actual* fixture — no screenshots, nothing that can go stale.

```tsx
import Link from 'next/link'
import PositioningMap from '@/components/dashboard/PositioningMap'
import CompetitorCards from '@/components/dashboard/CompetitorCards'
import { sampleReport, sampleStats } from '@/lib/sample'

/** The three most directly competing, by the report's own overlap score. */
const topCompetitors = [...sampleReport.competitors]
  .sort((a, b) => b.overlapScore - a.overlapScore)
  .slice(0, 3)

export default function SampleSlice() {
  return (
    <section className="border-t border-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-serif text-3xl leading-tight text-neutral-50 md:text-4xl">
              This is the real output
            </h2>
            <p className="mt-3 max-w-xl text-neutral-400">
              Rendered live from a stored run, by the same components the app
              uses. Not a screenshot.
            </p>
          </div>
          <Link
            href="/sample"
            className="text-sm text-emerald-400 underline underline-offset-4 hover:text-emerald-300"
          >
            Read the whole report →
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border border-neutral-900 bg-neutral-900/20 p-5 md:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-neutral-600">
            Positioning
          </p>
          <div className="mt-5">
            <PositioningMap positioning={sampleReport.positioning} />
          </div>

          <p className="mt-12 font-mono text-xs uppercase tracking-[0.16em] text-neutral-600">
            Competitors — {topCompetitors.length} of {sampleStats.competitors}
          </p>
          <div className="mt-5">
            <CompetitorCards competitors={topCompetitors} />
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Build the how-it-works section**

Create `components/landing/HowItWorks.tsx`:

```tsx
const STEPS = [
  {
    n: '01',
    title: 'Research the live web',
    body: 'Claude Opus 5 runs with extended thinking and server-side web search and fetch, issuing real queries against the current web rather than recalling training data. A run makes around twenty searches and reads the pages it finds.',
  },
  {
    n: '02',
    title: 'Structure against a schema',
    body: 'The research notes are reshaped into a schema-validated payload across three constrained calls — landscape, strategy, valuation. A comparable without a source URL cannot survive validation, so the integrity rules are enforced by the type system rather than requested in a prompt.',
  },
  {
    n: '03',
    title: 'Watch it happen',
    body: 'Progress is persisted as the run proceeds, so the report page streams the actual search queries being issued and survives a refresh. Closing the tab does not cancel the run.',
  },
]

const CONTENTS = [
  ['Competitors', 'Direct, adjacent and emerging, each scored for how directly it competes for your customer.'],
  ['Positioning', 'The two dimensions that genuinely separate the market, with you plotted against everyone else.'],
  ['SWOT and moat', 'A defensibility verdict that is willing to say "weak" and explain why.'],
  ['Gaps', 'Segments nobody serves, with the evidence that they are unserved.'],
  ['Wedge', 'One recommended way in, the reasoning behind it, and the first move.'],
  ['Valuation', 'Sourced comparable rounds, and a range only when the comparables support one.'],
] as const

export default function HowItWorks() {
  return (
    <section className="border-t border-neutral-900">
      <div className="mx-auto w-full max-w-5xl px-6 py-24">
        <h2 className="font-serif text-3xl leading-tight text-neutral-50 md:text-4xl">
          How a report gets made
        </h2>

        <div className="mt-12 space-y-px">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="grid gap-4 border-t border-neutral-900 py-8 md:grid-cols-[4rem_1fr_2fr] md:gap-8"
            >
              <span className="font-mono text-sm text-emerald-600">{s.n}</span>
              <h3 className="font-serif text-xl text-neutral-100">{s.title}</h3>
              <p className="leading-relaxed text-neutral-400">{s.body}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-20 font-serif text-2xl text-neutral-50">
          What is in a report
        </h3>
        <dl className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {CONTENTS.map(([term, description]) => (
            <div key={term} className="border-t border-neutral-800 pt-4">
              <dt className="text-sm font-medium text-neutral-100">{term}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-neutral-500">
                {description}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Build the cost band**

Create `components/landing/CostBand.tsx`. Stating the cost is what makes the password gate read as a deliberate constraint rather than an obstacle:

```tsx
import Cta from './Cta'

export default function CostBand() {
  return (
    <section className="border-t border-neutral-900 bg-neutral-900/20">
      <div className="mx-auto w-full max-w-5xl px-6 py-24">
        <h2 className="max-w-2xl font-serif text-3xl leading-tight text-neutral-50 md:text-4xl">
          Why there is a password
        </h2>
        <p className="mt-6 max-w-2xl leading-relaxed text-neutral-400">
          A single run spends roughly seven dollars of API tokens and takes ten
          to fifteen minutes of live research. That is the cost of reading the
          web instead of guessing at it, and it is why this is not an open text
          box on the internet. Access is shared by password.
        </p>
        <div className="mt-9">
          <Cta href="/analyze">Run an analysis →</Cta>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Compose the page**

Replace `app/page.tsx` entirely:

```tsx
import Nav from '@/components/landing/Nav'
import Hero from '@/components/landing/Hero'
import SourcedProof from '@/components/landing/SourcedProof'
import SampleSlice from '@/components/landing/SampleSlice'
import HowItWorks from '@/components/landing/HowItWorks'
import CostBand from '@/components/landing/CostBand'
import Footer from '@/components/landing/Footer'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      <Nav />
      <main className="flex-1">
        <Hero />
        <SourcedProof />
        <SampleSlice />
        <HowItWorks />
        <CostBand />
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 7: Look at it**

Run: `npm run dev`, open `http://localhost:3000/`.

Check, in this order:

1. The page renders with no console errors. `PositioningMap` is a client component (`'use client'`) imported into a server component — that is supported and should just work.
2. The hero headline is serif; body copy is Geist.
3. The positioning map draws with 16 plotted points.
4. Three competitor cards render, headed "Competitors — 3 of 18".
5. Narrow the window to ~380px: nothing overflows horizontally, the stat grid and competitor cards stack.
6. The caveat pull-quote shows real prose, not an empty block.

- [ ] **Step 8: Run lint, tests, and the build**

```bash
npm run lint
npm test
npm run build
```

Expected: all pass. The build must not warn about a missing `metadataBase`.

- [ ] **Step 9: Commit and push**

```bash
git add app/page.tsx components/landing
git commit -m "feat: build the public landing page"
git push origin main
```

---

### Task 5: The public sample report

Extract the report dashboard into a reusable view and serve the fixture through it at `/sample`.

**Files:**
- Create: `components/dashboard/ReportView.tsx`
- Modify: `app/report/[id]/page.tsx` (delegate to `ReportView`)
- Create: `app/sample/page.tsx`

**Interfaces:**
- Consumes: `Report` from `@/lib/analysis/schema`, `UsageSummary` from `@/lib/cost`, `sampleReport` from `@/lib/sample`
- Produces: `ReportView({ report, usage?, banner? })` — default export

- [ ] **Step 1: Extract the dashboard into ReportView**

Create `components/dashboard/ReportView.tsx`, moving the rendering body out of `app/report/[id]/page.tsx` unchanged apart from taking props:

```tsx
import type { Report } from '@/lib/analysis/schema'
import type { UsageSummary } from '@/lib/cost'
import Section from './Section'
import CompetitorCards from './CompetitorCards'
import PositioningMap from './PositioningMap'
import SwotMoat from './SwotMoat'
import GapsWedge from './GapsWedge'
import ValuationPanel from './ValuationPanel'

const CONFIDENCE_STYLE = {
  high: 'border-emerald-900 text-emerald-400',
  medium: 'border-amber-900 text-amber-400',
  low: 'border-rose-900 text-rose-400',
} as const

/**
 * The report dashboard, shared by a stored run at `/report/[id]` and the public
 * fixture at `/sample`. Both must render identically — a sample that diverges
 * from the product is worse than no sample — so there is one component and the
 * pages differ only in what they put in `banner`.
 */
export default function ReportView({
  report: r,
  usage,
  banner,
}: {
  report: Report
  usage?: UsageSummary | null
  banner?: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-5xl">
      {banner}

      <header className="pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl tracking-tight text-neutral-50">
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
          {usage && (
            <>
              {' '}
              · {usage.webSearches} searches · ~$
              {usage.estimatedTokenCostUsd.toFixed(2)} in tokens
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
        id="valuation"
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
  )
}
```

- [ ] **Step 2: Let Section take an anchor id**

`SourcedProof` links to `/sample#valuation`, so `Section` needs an optional `id`. Modify `components/dashboard/Section.tsx`:

```tsx
export default function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-8 border-t border-neutral-900 py-10">
      <h2 className="text-xl font-medium text-neutral-100">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}
```

- [ ] **Step 3: Point the proof link at the anchor**

In `components/landing/SourcedProof.tsx`, change the "See the full valuation panel" link `href` from `/sample` to `/sample#valuation`.

- [ ] **Step 4: Delegate the report page to ReportView**

In `app/report/[id]/page.tsx`, delete the `CONFIDENCE_STYLE` constant, the now-unused `Section` / dashboard imports, and the whole rendering block, replacing the final `return` with:

```tsx
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12">
      <ReportView report={row.payload} usage={row.usage} />
    </main>
  )
```

and importing it:

```tsx
import ReportView from '@/components/dashboard/ReportView'
```

Keep `notFound()`, the `running` branch with `RunProgress`, and the `failed` branch exactly as they are.

- [ ] **Step 5: Build the sample page**

Create `app/sample/page.tsx`:

```tsx
import Link from 'next/link'
import type { Metadata } from 'next'
import ReportView from '@/components/dashboard/ReportView'
import Nav from '@/components/landing/Nav'
import Footer from '@/components/landing/Footer'
import Cta from '@/components/landing/Cta'
import { sampleReport } from '@/lib/sample'

export const metadata: Metadata = {
  title: 'A sample report · checkcompetition',
  description:
    'A complete competitor analysis, exactly as the product produced it — including the valuation range it declined to report.',
}

function Banner() {
  return (
    <div className="mb-10 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-500">
        Sample report
      </p>
      <p className="mt-4 max-w-2xl leading-relaxed text-neutral-300">
        A real run, stored and rendered unedited. The company is the example
        from the analyze form, so nothing here is anyone&rsquo;s confidential
        work. Note the valuation panel: research found comparable rounds but not
        enough disclosed valuations to support a range, so it reports none.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Cta href="/analyze">Run one on your company →</Cta>
        <Link
          href="/"
          className="text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
        >
          Back to the front page
        </Link>
      </div>
    </div>
  )
}

export default function SamplePage() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      <Nav />
      <main className="flex-1 px-6 py-6">
        <ReportView report={sampleReport} banner={<Banner />} />
      </main>
      <Footer />
    </div>
  )
}
```

- [ ] **Step 6: Verify both report surfaces**

Run `npm run dev`, then:

1. Open `http://localhost:3000/sample` — the full report renders: 18 competitor cards, positioning map, SWOT, gaps, wedge, the amber "No implied range reported" card, a 9-row comparables table, 8 caveats, and 38 source links.
2. Open `http://localhost:3000/` and click "See the full valuation panel" — it lands on `/sample` scrolled to the valuation section.
3. Open `http://localhost:3000/report/rxYrnGVYlC1i` — the stored report renders identically to `/sample`, plus the usage line in the header, and with no sample banner.

- [ ] **Step 7: Run lint, tests, and the build**

```bash
npm run lint
npm test
npm run build
```

Expected: all pass. The build output should list `/` and `/sample` as prerendered static routes.

- [ ] **Step 8: Commit and push**

```bash
git add components/dashboard app/sample app/report components/landing/SourcedProof.tsx
git commit -m "feat: publish a sample report at /sample via a shared ReportView"
git push origin main
```

---

### Task 6: Documentation and deploy

**Files:**
- Modify: `README.md`
- Modify: `DEPLOY.md`

- [ ] **Step 1: Document the routes**

Add to `README.md`, after the opening description:

```markdown
## Routes

| Path | Access | What it is |
| --- | --- | --- |
| `/` | public | Landing page |
| `/sample` | public | A complete stored report, rendered unedited |
| `/analyze` | password | The form that starts a run |
| `/report/[id]` | password | A run in progress or its finished report |

The public pages render `lib/sample/report.json` — a real completed run —
through the same dashboard components the app uses, so the sample cannot drift
from the product. The fixture is parsed against `ReportSchema` at import, so a
schema change fails the build rather than publishing a stale shape.

`proxy.ts` holds the allowlist. `/api/analyze`, the route that spends money, is
not on it.
```

- [ ] **Step 2: Add post-deploy verification to DEPLOY.md**

Append to the "Redeploy" section of `DEPLOY.md`:

```markdown
After redeploying, verify the gate from a machine with no session cookie:

```bash
for path in / /sample /analyze /api/analyze; do
  printf '%s -> ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://checkcompetition.org$path"
done
```

Expected: `/` 200, `/sample` 200, `/analyze` 307, `/api/analyze` 401. Anything
else means the allowlist in `proxy.ts` is wrong — a 200 on `/analyze` means the
site is open and spending is unbounded.
```

- [ ] **Step 3: Commit and push the docs**

```bash
git add README.md DEPLOY.md
git commit -m "docs: document the public routes and post-deploy gate check"
git push origin main
```

- [ ] **Step 4: Deploy to the droplet**

```bash
ssh root@168.144.102.11 'cd /opt/checkcompetition && git pull && docker compose up -d --build'
```

The build spikes above 2 GB RAM; swap is already enabled on this box. If the build is OOM-killed, confirm with `swapon --show` before retrying.

- [ ] **Step 5: Verify the running containers**

```bash
ssh root@168.144.102.11 'cd /opt/checkcompetition && docker compose ps'
```

Expected: `app` and `caddy` both `running`.

- [ ] **Step 6: Verify the gate in production**

```bash
for path in / /sample /analyze /api/analyze; do
  printf '%s -> ' "$path"
  curl -s -o /dev/null -w '%{http_code}\n' "https://checkcompetition.org$path"
done
```

Expected: `200`, `200`, `307`, `401`.

**If `/analyze` returns 200, the site is unprotected and every visitor can spend money.** Stop, fix the allowlist, and redeploy before doing anything else.

- [ ] **Step 7: Confirm the landing page renders in production**

```bash
curl -s https://checkcompetition.org | grep -o 'that cites its sources'
curl -s https://checkcompetition.org/sample | grep -c 'No implied range reported'
```

Expected: the headline matches, and the sample page contains the "No implied range reported" card at least once.

- [ ] **Step 8: Confirm report history survived**

```bash
ssh root@168.144.102.11 "cd /opt/checkcompetition && docker compose exec -T app node -e \"const d=require('better-sqlite3')('/data/reports.db');console.log(d.prepare('SELECT id,status FROM reports ORDER BY created_at DESC LIMIT 5').all())\""
```

Expected: prior reports still listed. A rebuild does not touch the `reports` volume; this confirms it.

---

## Self-Review

**Spec coverage.** Public `/` — Task 4. Public `/sample` — Task 5. Gated `/analyze` — Task 2. Allowlist — Task 2. Fixture parsed against `ReportSchema` — Task 1. Derived figures — Task 1, consumed in Tasks 4 and 5. The refusal as centrepiece — Task 4 Step 2. Sample slice through real components — Task 4 Step 3. How it works and report contents — Task 4 Step 4. Cost band — Task 4 Step 5. Display serif and colour vocabulary — Task 3. Metadata — Task 3. `ReportView` extraction — Task 5. All three in-scope corrections — Task 2 Steps 6–7 and Task 3 Step 2. Tests — Tasks 1 and 2. Deploy verification of all four routes — Task 6.

**Type consistency.** `sampleStats` field names are defined in Task 1 and used unchanged in Tasks 4 and 5. `Cta`'s `variant` values (`primary`, `ghost`) are defined in Task 3 and only those two are used. `ReportView`'s props are defined in Task 5 Step 1 and matched by both call sites. `Section`'s new optional `id` is added in Task 5 Step 2 before Step 5 depends on it.

**Ordering note.** Task 4 Step 2 writes the "See the full valuation panel" link pointing at `/sample`, which does not exist until Task 5. Next.js renders a `Link` to a missing route without error and Task 5 Step 3 upgrades it to the `#valuation` anchor, so no intermediate state is broken.
