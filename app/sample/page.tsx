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
