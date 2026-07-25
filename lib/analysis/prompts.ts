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
