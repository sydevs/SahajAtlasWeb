import type { TFunction } from 'i18next'
import type { StackEntry } from '@/lib/shape'

import { describe, it, expect } from 'vitest'

import { type NavNaming, backLabel } from './nav-names'

// A stand-in for i18next. It returns the en copy for the handful of keys this test
// reaches, so the assertions read as the sentence a screen reader would speak, not a key.
const t = ((key: string, opts?: { title?: string; place?: string }) => {
  const copy: Record<string, string> = {
    'common.chrome.back': 'Back',
    'common.chrome.back_to': `Back to ${opts?.title}`,
    'common.chrome.back_to_world_map': 'Back to the world map',
    'common.chrome.back_to_results_near': `Back to results near ${opts?.place}`,
    'search.chrome.title': 'Search',
    'online.title': 'Online Classes',
    'calendar.title': 'Calendar',
    'filters.chrome.title': 'Filters',
  }

  return copy[key] ?? key
}) as unknown as TFunction

const regionNames = new Map([
  ['gb', 'United Kingdom'],
  ['london', 'London'],
])
const titles = new Map([[7, 'Monday Evening Meditation']])

// What Back says when it goes to `entry` (the root when there is none).
const label = (entry: StackEntry | undefined, naming: NavNaming) =>
  backLabel(entry?.path ?? '/', naming)

describe('backLabel — every kind of place Back can go to', () => {
  it('names the root as the world map', () => {
    expect(label(undefined, { t, regionNames, titles })).toBe('Back to the world map')
  })

  it('gives nested regions different names — the case the generic label failed', () => {
    const gb: StackEntry = { kind: 'region', slug: 'gb', path: '/gb' }
    const london: StackEntry = { kind: 'region', slug: 'london', path: '/gb/london' }

    expect(label(gb, { t, regionNames, titles })).toBe('Back to United Kingdom')
    expect(label(london, { t, regionNames, titles })).toBe('Back to London')
  })

  it('falls back to a readable slug when the region cache has not been filled', () => {
    // The read is cache-only by design, so a miss has to cost the pretty name and
    // nothing else.
    const entry: StackEntry = { kind: 'region', slug: 'united-kingdom', path: '/united-kingdom' }

    expect(label(entry, { t })).toBe('Back to United Kingdom')
    expect(label({ kind: 'region', slug: 'gb', path: '/gb' }, { t })).toBe('Back to GB')
  })

  it("prefers a country's display name, as RegionView's heading does", () => {
    const countryName = (code: string) => (code === 'GB' ? 'Royaume-Uni' : undefined)

    expect(label({ kind: 'region', slug: 'gb', path: '/gb' }, { t, countryName })).toBe(
      'Back to Royaume-Uni',
    )
  })

  it('names an event from the titles sliver', () => {
    const entry: StackEntry = { kind: 'event', id: 7, path: '/gb/london/7' }

    expect(label(entry, { t, regionNames, titles })).toBe('Back to Monday Evening Meditation')
  })

  it('degrades to plain "Back" for an event whose title is not cached', () => {
    const entry: StackEntry = { kind: 'event', id: 99, path: '/gb/london/99' }

    expect(label(entry, { t, regionNames, titles })).toBe('Back')
  })

  it('names the standalone views from the copy they already own', () => {
    const cases: [StackEntry, string][] = [
      [{ kind: 'search', path: '/search' }, 'Back to Search'],
      [{ kind: 'calendar', path: '/calendar' }, 'Back to Calendar'],
      [{ kind: 'filters', path: '/filters' }, 'Back to Filters'],
      [{ kind: 'online', regionSlug: 'gb', path: '/gb/online' }, 'Back to Online Classes'],
    ]

    for (const [entry, expected] of cases) {
      expect(label(entry, { t, regionNames, titles })).toBe(expected)
    }
  })

  it('never returns an empty name', () => {
    // Whatever the caches hold, Back is a button. A button with no accessible name is a
    // worse outcome than a vague one.
    const entries: (StackEntry | undefined)[] = [
      undefined,
      { kind: 'register', eventPath: '/gb/london/7', path: '/gb/london/7/register' },
      { kind: 'share', eventPath: '/gb/london/7', path: '/gb/london/7/share' },
    ]

    for (const entry of entries) {
      expect(label(entry, { t })).toBeTruthy()
    }
  })
})

describe('backLabel', () => {
  const naming = { t, regionNames, titles }

  it('says a country goes back to the world map', () => {
    expect(backLabel('/', naming)).toBe('Back to the world map')
  })

  it('names the place a class or place goes back to', () => {
    expect(backLabel('/gb/london', naming)).toBe('Back to London')
    expect(backLabel('/gb/london/7', naming)).toBe('Back to Monday Evening Meditation')
  })

  it('names the place a search was for, by its first part', () => {
    expect(backLabel('/search?q=Prague%2C+Czechia&center=14.4,50.1', naming)).toBe(
      'Back to results near Prague',
    )
    expect(backLabel('/search', naming)).toBe('Back to Search')
  })
})
