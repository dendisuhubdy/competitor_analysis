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
            href="/sample#valuation"
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
