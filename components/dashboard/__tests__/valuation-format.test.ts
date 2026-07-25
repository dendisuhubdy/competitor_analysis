import { describe, it, expect } from 'vitest'
import { formatUsd } from '@/components/dashboard/ValuationPanel'

describe('formatUsd', () => {
  it('renders millions compactly', () => {
    expect(formatUsd(12_000_000)).toBe('$12M')
  })

  it('renders billions compactly', () => {
    expect(formatUsd(2_400_000_000)).toBe('$2.4B')
  })

  it('renders sub-million values with thousands', () => {
    expect(formatUsd(750_000)).toBe('$750K')
  })

  it('renders null as an explicit not-disclosed marker, never as zero', () => {
    expect(formatUsd(null)).toBe('Not disclosed')
  })
})
