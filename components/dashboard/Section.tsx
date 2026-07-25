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
