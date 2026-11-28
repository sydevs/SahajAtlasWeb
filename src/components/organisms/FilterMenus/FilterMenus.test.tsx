import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FilterMenus } from './FilterMenus'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

// Node-only SSR assertions (see `docs/testing.md`). Every menu is a closed portal here, so only the
// row and its buttons render, which is what these cases are about. The URL (through the filter
// editor and the search params), copy and the scope are mocked at the boundary; with no scope,
// the Language button has nothing to offer.
const state = vi.hoisted(() => ({
  filters: {} as EventFilters,
  search: '',
  searchable: true,
}))

vi.mock('@/hooks/use-filter-editor', () => ({
  useFilterEditor: () => ({
    filters: state.filters,
    write() {},
    clear() {},
    where: {
      region: state.filters.region,
      searchable: state.searchable,
      onPlace() {},
      onClear() {},
    },
  }),
}))
vi.mock('react-router', async (original) => ({
  ...(await original<object>()),
  useSearchParams: () => [new URLSearchParams(state.search)],
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<object>()),
  useQuery: () => ({ data: [{ slug: 'gb', name: 'United Kingdom' }] }),
}))
vi.mock('@/config/api', () => ({ regionsQuery: () => ({ queryKey: ['regions'] }) }))
vi.mock('@/components/organisms/WhereFilter', () => ({ WhereFilter: () => null }))
vi.mock('@/hooks/use-near-me', () => ({ useNearVisitor: () => false }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: 'en',
    formatLocale: 'en-US',
    languageLabel: (code: string) => code,
  }),
}))
vi.mock('@/hooks/use-filter-counts', () => ({
  useFilterCounts: () => undefined,
  useFilterScope: () => undefined,
}))

const render = (
  value: Partial<EventFilters> = {},
  { search = '', searchable = true } = {},
  variant: 'inline' | 'floating' = 'floating',
) => {
  Object.assign(state, { filters: { ...DEFAULT_FILTERS, ...value }, search, searchable })

  return renderToStaticMarkup(<FilterMenus variant={variant} />)
}

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
    const [whereButton] = buttons(render({ region: 'gb' }))

    expect(whereButton).toContain('United Kingdom')
    expect(filled(whereButton)).toBe(false)
  })

  it('fills for a searched place, named by its first part', () => {
    const [whereButton] = buttons(render({}, { search: '?q=London,+UK&center=-0.1,51.5' }))

    expect(whereButton).toContain('London')
    expect(filled(whereButton)).toBe(true)
  })

  it('leaves Where out where it has nothing to ask', () => {
    expect(buttons(render({}, { searchable: false }))).toHaveLength(1)
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
  it('leads the row with Clear, as over the map, away from the view’s own close', () => {
    const shown = buttons(render({ daysOfWeek: [2] }, {}, 'inline'))

    expect(shown[0]).toContain('aria-label="filters.chrome.clear"')
  })
})
