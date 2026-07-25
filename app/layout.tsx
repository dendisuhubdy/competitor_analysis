import type { Metadata } from 'next'
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

/**
 * One display face, used for headlines only. Instrument Serif ships a single
 * weight, which is the point: there is no weight axis to misuse.
 */
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
})

const DESCRIPTION =
  'Describe your company and get a researched competitive analysis — competitor profiles, positioning, gaps, and sourced funding comparables. Every number carries a URL, or it is not shown.'

export const metadata: Metadata = {
  metadataBase: new URL('https://checkcompetition.org'),
  title: {
    default: 'Competitor analysis that cites its sources',
    template: '%s',
  },
  description: DESCRIPTION,
  openGraph: {
    title: 'Competitor analysis that cites its sources',
    description: DESCRIPTION,
    url: '/',
    siteName: 'checkcompetition',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Competitor analysis that cites its sources',
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-950">{children}</body>
    </html>
  )
}
