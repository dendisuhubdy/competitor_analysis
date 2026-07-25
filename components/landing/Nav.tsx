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
        {/* Below ~640px the wordmark, this link and the button collide. The
            sample is reachable from the hero and the footer, so this is the one
            that goes. */}
        <Link
          href="/sample"
          className="hidden text-sm text-neutral-400 transition hover:text-neutral-100 sm:block"
        >
          Sample report
        </Link>
        <Cta href="/analyze">Run an analysis</Cta>
      </div>
    </nav>
  )
}
