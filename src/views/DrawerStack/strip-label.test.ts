import type { TFunction } from 'i18next'
import type { StackEntry } from '@/lib/shape'

import { describe, it, expect } from 'vitest'

import { stripLabel } from './strip-label'

// A stand-in for i18next that returns the en copy for the handful of keys this reaches,
// so the assertions read as the sentence a screen reader would speak rather than a key.
const t = ((key: string, opts?: { title?: string }) => {
  const copy: Record<string, string> = {
    back: 'Back',
    back_to: `Back to ${opts?.title}`,
    search: 'Search',
    online_classes: 'Online Classes',
    'calendar.title': 'Calendar',
    'filters.title': 'Filters',
  }

  return copy[key] ?? key
}) as unknown as TFunction<'common'>

const regionNames = new Map([
  ['gb', 'United Kingdom'],
  ['london', 'London'],
])
const titles = new Map([[7, 'Monday Evening Meditation']])

describe('stripLabel', () => {
  it('names the root strip "Back", which cannot collide because there is only one root', () => {
    expect(stripLabel(undefined, { t, regionNames, titles })).toBe('Back')
  })

  it('gives nested regions different names — the case the generic label failed', () => {
    const gb: StackEntry = { kind: 'region', slug: 'gb', path: '/gb' }
    const london: StackEntry = { kind: 'region', slug: 'london', path: '/gb/london' }

    expect(stripLabel(gb, { t, regionNames, titles })).toBe('Back to United Kingdom')
    expect(stripLabel(london, { t, regionNames, titles })).toBe('Back to London')
  })

  it('falls back to the slug when the region cache has not been filled', () => {
    // The read is cache-only by design, so a miss has to cost the pretty name and
    // nothing else. A slug is still unique per strip, so the names stay distinct.
    const entry: StackEntry = { kind: 'region', slug: 'brussels', path: '/be/brussels' }

    expect(stripLabel(entry, { t })).toBe('Back to brussels')
  })

  it('names an event from the titles sliver', () => {
    const entry: StackEntry = { kind: 'event', id: 7, path: '/gb/london/7' }

    expect(stripLabel(entry, { t, regionNames, titles })).toBe('Back to Monday Evening Meditation')
  })

  it('degrades to plain "Back" for an event whose title is not cached', () => {
    const entry: StackEntry = { kind: 'event', id: 99, path: '/gb/london/99' }

    expect(stripLabel(entry, { t, regionNames, titles })).toBe('Back')
  })

  it('names the standalone views from the copy they already own', () => {
    const cases: [StackEntry, string][] = [
      [{ kind: 'search', path: '/search' }, 'Back to Search'],
      [{ kind: 'calendar', path: '/calendar' }, 'Back to Calendar'],
      [{ kind: 'filters', path: '/filters' }, 'Back to Filters'],
      [{ kind: 'online', regionSlug: 'gb', path: '/gb/online' }, 'Back to Online Classes'],
    ]

    for (const [entry, expected] of cases) {
      expect(stripLabel(entry, { t, regionNames, titles })).toBe(expected)
    }
  })

  it('never returns an empty name', () => {
    // Whatever the caches hold, a strip is a button; a button with no accessible name is
    // a worse outcome than a vague one.
    const entries: (StackEntry | undefined)[] = [
      undefined,
      { kind: 'register', eventPath: '/gb/london/7', path: '/gb/london/7/register' },
      { kind: 'share', eventPath: '/gb/london/7', path: '/gb/london/7/share' },
    ]

    for (const entry of entries) {
      expect(stripLabel(entry, { t })).toBeTruthy()
    }
  })
})
