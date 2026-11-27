import type { TFunction } from 'i18next'

import { describe, it, expect } from 'vitest'

import { backLabel } from './nav-names'

// A stand-in for i18next. It returns the en copy for the handful of keys this test
// reaches, so the assertions read as the sentence a screen reader would speak, not a key.
const t = ((key: string, opts?: { title?: string; place?: string }) => {
  const copy: Record<string, string> = {
    'common.chrome.back': 'Back',
    'common.chrome.back_to': `Back to ${opts?.title}`,
    'common.chrome.back_to_class': 'Back to class',
    'common.chrome.back_to_world_map': 'Back to the world map',
    'common.chrome.back_to_results_near': `Back to results near ${opts?.place}`,
    'search.chrome.title': 'Search',
    'online.title': 'Online classes',
    'calendar.title': 'Calendar',
    'filters.chrome.title': 'Filters',
  }

  return copy[key] ?? key
}) as unknown as TFunction

const regionName = (slug: string) =>
  ({ gb: 'United Kingdom', london: 'London' })[slug as 'gb' | 'london']
const naming = { t, regionName }

describe('backLabel', () => {
  it.each([
    ['/', 'Back to the world map'],
    ['/gb', 'Back to United Kingdom'],
    ['/gb/london', 'Back to London'],
    ['/gb/london/7', 'Back to class'],
    ['/search?q=Prague%2C+Czechia&center=14.4,50.1', 'Back to results near Prague'],
    ['/search', 'Back to Search'],
    ['/calendar', 'Back to Calendar'],
    ['/filters', 'Back to Filters'],
    ['/gb/online', 'Back to Online classes'],
  ])('names %s as "%s"', (route, label) => {
    expect(backLabel(route, naming)).toBe(label)
  })

  it('falls back to a readable slug, or a code, when the region cache has not been filled', () => {
    // The read is cache-only by design, so a miss has to cost the pretty name and nothing else.
    expect(backLabel('/united-kingdom', { t })).toBe('Back to United Kingdom')
    expect(backLabel('/gb', { t })).toBe('Back to GB')
  })

  it("prefers a country's display name, as RegionView's heading does", () => {
    const countryName = (code: string) => (code === 'GB' ? 'Royaume-Uni' : undefined)

    expect(backLabel('/gb', { ...naming, countryName })).toBe('Back to Royaume-Uni')
  })

  it('never returns an empty name', () => {
    // Whatever the caches hold, Back is a button. A button with no accessible name is a worse
    // outcome than a vague one.
    for (const route of ['/', '/gb/london/7/register']) expect(backLabel(route, { t })).toBeTruthy()
  })
})
