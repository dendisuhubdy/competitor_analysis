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
