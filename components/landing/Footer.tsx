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
