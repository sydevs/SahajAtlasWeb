import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SearchFilters } from './SearchFilters'

import { DEFAULT_FILTERS } from '@/lib/shape'

// Node-only SSR assertions (see `docs/testing.md`). The form is fully controlled and store-free,
// so the only things it reaches for are copy and the locale, both mocked at the boundary.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', formatLocale: 'en-US', languageLabel: (code: string) => code }),
}))

const render = (filters = DEFAULT_FILTERS) =>
  renderToStaticMarkup(<SearchFilters value={filters} onChange={() => {}} />)

// Each question's Clear is hidden, never unmounted, while the question is unanswered, so its
// appearing cannot move the form. The invariant is the COUNT, whatever the styling.
describe('SearchFilters — the per-group Clear reserves its space', () => {
  const clearButtons = (html: string) =>
    html.match(/<button[^>]*>filters\.chrome\.clear_one<\/button>/g) ?? []

  it('renders the same number of Clear buttons with nothing selected as with a selection', () => {
    const idle = clearButtons(render())
    const active = clearButtons(render({ ...DEFAULT_FILTERS, format: 'online', daysOfWeek: [1] }))

    expect(idle.length).toBeGreaterThan(0)
    expect(idle).toHaveLength(active.length)
  })

  it('hides every Clear while its group is untouched', () => {
    const buttons = clearButtons(render())

    // This asserts before the `every`, which is vacuously true on an
    // empty list. An empty list is exactly what the unmounting bug
    // produces. So without this, the spec would pass against the defect
    // it exists to catch.
    expect(buttons.length).toBeGreaterThan(0)
    // `visibility: hidden` keeps the button in flow, while taking it out of
    // the tab order and the accessibility tree. So a hidden control is
    // never reachable.
    expect(buttons.every((button) => button.includes('invisible'))).toBe(true)
  })

  it('reveals only the Clear of a group that has a selection', () => {
    const buttons = clearButtons(render({ ...DEFAULT_FILTERS, format: 'online' }))
    const shown = buttons.filter((button) => !button.includes('invisible'))

    expect(shown).toHaveLength(1)
    // The others are still there, hidden, for the same reason as above.
    expect(buttons.length).toBeGreaterThan(shown.length)
  })
})

describe('SearchFilters — the questions this scope can answer', () => {
  const facets = {
    counts: {
      total: 3,
      format: { offline: 3, online: 0 },
      days: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
      time: { morning: 0, afternoon: 0, evening: 3, night: 0 },
      cadence: { DAILY: 0, WEEKLY: 3, MONTHLY: 0, once: 0 },
      languages: [{ code: 'cs', count: 3 }],
    },
    relevance: { format: false, days: true, time: false, cadence: false },
  }
  // The attribute, not the class list, which names `disabled:` variants on every item.
  const disabledOption = (markup: string, inner: string) =>
    / disabled=""/.test(markup.match(new RegExp(`<button([^>]*)>${inner}`))?.[1] ?? '')
  const withFacets = (filters = DEFAULT_FILTERS) =>
    renderToStaticMarkup(<SearchFilters facets={facets} value={filters} onChange={() => {}} />)

  it('asks no question that cannot narrow the results, but still names the language', () => {
    const html = withFacets()

    expect(html).not.toContain('filters.format.question')
    expect(html).not.toContain('filters.time.label')
    expect(html).toContain('filters.days.short_label')
    expect(html).toMatch(/cs<\/span><span[^>]*>3<\/span>/)
  })

  it('keeps an answered question, and disables an option that leaves nothing unless chosen', () => {
    const html = withFacets({ ...DEFAULT_FILTERS, format: 'online' })

    expect(html).toContain('filters.format.question')
    expect(disabledOption(html, 'filters.format.online')).toBe(false)
    expect(
      disabledOption(
        withFacets({ ...DEFAULT_FILTERS, format: 'offline' }),
        'filters.format.online',
      ),
    ).toBe(true)
    expect(disabledOption(withFacets(), 'Tue')).toBe(true)
    expect(disabledOption(withFacets(), 'Mon')).toBe(false)
  })

  it('keeps a chosen language this place lacks, so it can still be undone', () => {
    const html = withFacets({ ...DEFAULT_FILTERS, languages: ['fr'] })

    expect(html).toMatch(/fr<\/span><span[^>]*>0<\/span>/)
    expect(disabledOption(html, '<span class="truncate">fr')).toBe(false)
  })

  it('folds many languages into a dropdown', () => {
    const many = ['cs', 'de', 'en', 'fr', 'ru'].map((code) => ({ code, count: 1 }))
    const html = renderToStaticMarkup(
      <SearchFilters
        facets={{ ...facets, counts: { ...facets.counts, languages: many } }}
        value={DEFAULT_FILTERS}
        onChange={() => {}}
      />,
    )

    expect(html).toContain('filters.language.all')
  })

  it('opens More filters by itself when Frequency or Dates is set', () => {
    expect(render()).not.toContain('filters.cadence.label')
    expect(render({ ...DEFAULT_FILTERS, cadence: 'WEEKLY' })).toContain('filters.cadence.label')
  })
})

describe('SearchFilters — the times of day', () => {
  const facets = (night: number) => ({
    counts: {
      total: 4,
      format: { offline: 2, online: 2 },
      days: { 1: 4, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
      time: { morning: 1, afternoon: 1, evening: 2 - night, night },
      cadence: { DAILY: 0, WEEKLY: 4, MONTHLY: 0, once: 0 },
      languages: [],
    },
    relevance: { format: true, days: false, time: true, cadence: false },
  })
  const html = (night: number, filters = DEFAULT_FILTERS) =>
    renderToStaticMarkup(
      <SearchFilters facets={facets(night)} value={filters} onChange={() => {}} />,
    )

  it('shows each period’s hours in the visitor’s own clock', () => {
    expect(html(0)).toMatch(/filters\.time\.morning<.*?>6:00\sAM\s–\s12:00\sPM</)
  })

  it('offers Night only while some class here starts in it', () => {
    expect(html(0)).not.toContain('filters.time.night')
    expect(html(1)).toContain('filters.time.night')
  })

  it('keeps a chosen Night, so it can be undone', () => {
    expect(html(0, { ...DEFAULT_FILTERS, timeOfDay: ['night'] })).toContain('filters.time.night')
  })
})
