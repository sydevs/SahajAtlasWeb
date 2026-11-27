import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FilterMenus, type FilterMenusWhere } from './FilterMenus'

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

const where = (overrides: Partial<FilterMenusWhere> = {}): FilterMenusWhere => ({
  placeAnswered: false,
  always: true,
  menu: () => null,
  ...overrides,
})

const render = (value: Partial<EventFilters> = {}, whereProps?: Partial<FilterMenusWhere>) =>
  renderToStaticMarkup(
    <FilterMenus
      placement="map"
      value={{ ...DEFAULT_FILTERS, ...value }}
      where={where(whereProps)}
      onChange={() => {}}
      onClear={() => {}}
    />,
  )

const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? []
const filled = (button?: string) => Boolean(button?.includes('bg-primary-12'))

describe('FilterMenus — nothing chosen', () => {
  const html = render()

  it('shows Where and When as questions, none filled, and no Clear', () => {
    const shown = buttons(html)

    expect(shown.map((button) => button.replace(/<[^>]+>/g, ''))).toEqual([
      'filters.where.label',
      'filters.when.label',
    ])
    expect(shown.some(filled)).toBe(false)
  })
})

describe('FilterMenus — Tuesday evening, online', () => {
  const [clear, whereButton, when] = buttons(
    render({ daysOfWeek: [2], timeOfDay: ['evening'], format: 'online' }),
  )

  it('puts Clear first in the row', () => {
    expect(clear).toContain('aria-label="filters.chrome.clear"')
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

describe('FilterMenus — Where', () => {
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

describe('FilterMenus — past two answers, a count', () => {
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

describe('FilterMenus — in a toolbar', () => {
  it('ends the row on Clear, so its arrival moves nothing already there', () => {
    const shown = buttons(
      renderToStaticMarkup(
        <FilterMenus
          placement="toolbar"
          value={{ ...DEFAULT_FILTERS, daysOfWeek: [2] }}
          where={where()}
          onChange={() => {}}
          onClear={() => {}}
        />,
      ),
    )

    expect(shown.at(-1)).toContain('aria-label="filters.chrome.clear"')
    expect(shown[0]).toContain('filters.where.label')
  })
})
