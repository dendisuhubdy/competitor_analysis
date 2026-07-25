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
