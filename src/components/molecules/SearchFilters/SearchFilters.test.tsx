import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SearchFilters } from './SearchFilters'

import { DEFAULT_FILTERS } from '@/lib/shape'

// Node-only SSR assertions (see `docs/testing.md`). The form is fully
// controlled and store-free. So the only things it reaches for are copy,
// the locale, and the two cached reads it derives its option lists from.
// All are mocked at the boundary.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageLabel: (code: string) => code }),
}))
// This is partial. `config/query-client` constructs a real QueryClient
// on import, so only the hook is replaced. With no feed cached, the form
// still renders every group. The geojson read only supplies the Language
// dropdown's options.
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
// Mocked so the import chain never reaches `config/i18n`, which boots i18next on import.
vi.mock('@/config/api', () => ({
  geojsonQuery: () => ({ queryKey: ['geojson'] }),
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))

const render = (filters = DEFAULT_FILTERS) =>
  renderToStaticMarkup(<SearchFilters value={filters} onChange={() => {}} />)

// Every group's "Clear" link is HIDDEN, not unmounted, so appearing and
// disappearing cannot change its row's height.
//
// The row is `items-baseline`, and the two children have different line
// boxes: the label is `text-sm` (19.5px), Clear is `text-xs` (about
// 20px). So mounting the button on selection grew the row and pushed
// every section below it down the page. Reserving the space is what
// makes that impossible. Tuning the line-height only made the two
// numbers closer.
//
// The invariant is the COUNT, not the class. As long as the same number
// of buttons occupy the flex layout in both states, no amount of later
// restyling can reintroduce the jump.
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
    relevance: { format: false, days: true, time: false, cadence: false, languages: false },
  }
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
    // The attribute, not the class list, which names `disabled:` variants on every item.
    const disabled = (markup: string, inner: string) =>
      / disabled=""/.test(markup.match(new RegExp(`<button([^>]*)>${inner}`))?.[1] ?? '')

    expect(html).toContain('filters.format.question')
    expect(disabled(html, 'filters.format.online')).toBe(false)
    expect(
      disabled(withFacets({ ...DEFAULT_FILTERS, format: 'offline' }), 'filters.format.online'),
    ).toBe(true)
    expect(disabled(withFacets(), 'Tue')).toBe(true)
    expect(disabled(withFacets(), 'Mon')).toBe(false)
  })

  it('opens More filters by itself when Frequency or Dates is set', () => {
    expect(render()).not.toContain('filters.cadence.label')
    expect(render({ ...DEFAULT_FILTERS, cadence: 'WEEKLY' })).toContain('filters.cadence.label')
  })
})
