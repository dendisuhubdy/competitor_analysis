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
