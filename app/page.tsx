import Nav from '@/components/landing/Nav'
import Hero from '@/components/landing/Hero'
import SourcedProof from '@/components/landing/SourcedProof'
import SampleSlice from '@/components/landing/SampleSlice'
import HowItWorks from '@/components/landing/HowItWorks'
import CostBand from '@/components/landing/CostBand'
import Footer from '@/components/landing/Footer'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      <Nav />
      <main className="flex-1">
        <Hero />
        <SourcedProof />
        <SampleSlice />
        <HowItWorks />
        <CostBand />
      </main>
      <Footer />
    </div>
  )
}
