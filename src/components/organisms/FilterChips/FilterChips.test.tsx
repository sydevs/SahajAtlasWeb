import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FilterChips, type FilterChipsWhere } from './FilterChips'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

// Node-only SSR assertions (see `docs/testing.md`). Every menu is a closed portal here, so only the
// row and its buttons render, which is what these cases are about. Copy and the scope are mocked
// at the boundary; with no scope, the Language button has nothing to offer.
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: 'en',
    formatLocale: 'en-US',
    languageLabel: (code: string) => code,
  }),
}))
vi.mock('@/hooks/use-filter-facets', () => ({
  useFilterFacets: () => undefined,
  useFilterScope: () => undefined,
}))

const where = (overrides: Partial<FilterChipsWhere> = {}): FilterChipsWhere => ({
  placeAnswered: false,
  always: true,
  menu: () => null,
  ...overrides,
})

const render = (value: Partial<EventFilters> = {}, whereProps?: Partial<FilterChipsWhere>) =>
  renderToStaticMarkup(
    <FilterChips
      placement="map"
      value={{ ...DEFAULT_FILTERS, ...value }}
      where={where(whereProps)}
      onChange={() => {}}
      onClear={() => {}}
    />,
  )

const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? []
const filled = (button?: string) => Boolean(button?.includes('bg-primary-12'))

describe('FilterChips — nothing chosen', () => {
  const html = render()

  it('shows Where and When as questions, none filled, and no Clear', () => {
    const shown = buttons(html)

    expect(shown.map((button) => button.replace(/<[^>]+>/g, ''))).toEqual([
      'filters.where.label',
      'filters.when.label',
    ])
    expect(shown.some(filled)).toBe(false)
  })

  it('lets the map beside it take every press but its buttons', () => {
    expect(html).toMatch(/^<div[^>]*class="[^"]*pointer-events-none/)
    expect(buttons(html).every((button) => button.includes('pointer-events-auto'))).toBe(true)
  })
})

describe('FilterChips — Tuesday evening, online', () => {
  const [clear, whereButton, when] = buttons(
    render({ daysOfWeek: [2], timeOfDay: ['evening'], format: 'online' }),
  )

  it('puts Clear first in the row', () => {
    expect(clear).toContain('filters.chrome.clear_one')
  })

  it('fills each answered button and names its answer', () => {
    expect(filled(whereButton)).toBe(true)
    expect(whereButton).toContain('filters.format.online')
    expect(filled(when)).toBe(true)
    expect(when).toContain('Tue · filters.time.evening')
  })

  it('says the question before the answer to a screen reader', () => {
    expect(when).toMatch(/<span class="sr-only">filters\.when\.label: <\/span>Tue · /)
  })
})

describe('FilterChips — Where', () => {
  it('names a place page without filling', () => {
    const [whereButton] = buttons(render({ region: 'gb' }, { place: 'United Kingdom' }))

    expect(whereButton).toContain('United Kingdom')
    expect(filled(whereButton)).toBe(false)
  })

  it('fills for a searched place', () => {
    const [whereButton] = buttons(render({}, { place: 'London', placeAnswered: true }))

    expect(whereButton).toContain('London')
    expect(filled(whereButton)).toBe(true)
  })

  it('leaves Where out where it has nothing to ask', () => {
    expect(buttons(render({}, { always: false }))).toHaveLength(1)
  })
})

describe('FilterChips — past two answers, a count', () => {
  it('counts the When answers rather than listing them', () => {
    const [, , when] = buttons(render({ daysOfWeek: [2, 3], timeOfDay: ['evening'] }))

    expect(when).toContain('filters.when.count')
    expect(when).not.toContain('Tue')
  })

  it('still names two', () => {
    const [, , when] = buttons(render({ daysOfWeek: [2], timeOfDay: ['evening'] }))

    expect(when).toContain('Tue · filters.time.evening')
  })

  it('counts the languages rather than listing them', () => {
    const shown = buttons(render({ languages: ['en', 'fr', 'de'] }))

    expect(shown.at(-1)).toContain('filters.language.count')
  })
})
