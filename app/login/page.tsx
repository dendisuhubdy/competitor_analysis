import { Suspense } from 'react'
import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 py-16">
      <div className="mb-10 max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-50">
          Competitor analysis
        </h1>
        <p className="mt-3 text-sm text-neutral-400">
          This deployment is password protected. Each analysis runs live web
          research against a paid API, so access is limited.
        </p>
      </div>
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
