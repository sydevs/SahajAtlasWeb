import type { EventFilters, FilterFacets } from '@/lib/shape'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FilterView } from './FilterView'

// Node-only SSR assertions (see `docs/testing.md`). What is under test is what the URL's answers
// put on screen: the form stub prints the filters it was handed, and the footer offers the way out
// those answers earn.
const facets = vi.hoisted(() => ({ current: undefined as FilterFacets | undefined }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}(${options.count})`,
  }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', formatLocale: 'en-GB', languageLabel: (code: string) => code }),
}))
vi.mock('@/config/api', () => ({ regionQuery: () => ({ queryKey: ['region'] }) }))
vi.mock('@/hooks/use-filter-facets', () => ({ useFilterFacets: () => facets.current }))
vi.mock('./WhereFilter', () => ({ WhereFilter: () => null }))
vi.mock('@/components/organisms', async () => ({
  RecoveryButton: (await import('@/components/organisms/SearchFilters/RecoveryButton'))
    .RecoveryButton,
  SearchFilters: ({ value }: { value: EventFilters }) => <i>region:{value.region ?? '∅'}</i>,
}))
vi.mock('@/views/nav', () => ({ NavHeader: () => null }))
vi.mock('@/views/shared', () => ({
  useDrawerControl: () => ({ collapsed: false, toggle() {}, dismiss() {}, showResults() {} }),
  useFrameOnTop: () => {},
}))

const counts = (total: number) =>
  ({
    total,
    format: { offline: total, online: 0 },
    days: {},
    time: { morning: 0, afternoon: 0, evening: total, night: 0 },
    timeless: 0,
    cadence: { DAILY: 0, WEEKLY: total, MONTHLY: 0, once: 0 },
    languages: [],
  }) as FilterFacets['counts']
const relevance = { format: true, days: true, time: true, cadence: true }

const view = (entry: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <FilterView />
    </MemoryRouter>,
  )

beforeEach(() => {
  facets.current = { counts: counts(41), relevance }
})

describe('FilterView — the place it is scoped to', () => {
  it('reads the region it was opened over, without writing it into the URL', () => {
    expect(view('/gb/london/filters')).toContain('region:london')
  })

  it('keeps a region the URL already names', () => {
    expect(view('/gb/london/filters?region=gb')).toContain('region:gb')
  })

  it('is unscoped over the country list', () => {
    expect(view('/filters')).toContain('region:∅')
  })
})

describe('FilterView — the bottom button', () => {
  it('reads Close with nothing picked, the place in scope included', () => {
    const markup = view('/gb/filters')

    expect(markup).toContain('common.chrome.close')
    expect(markup).not.toContain('filters.chrome.show_classes')
    expect(markup).not.toContain('filters.chrome.clear')
  })

  it('shows the matching classes beside Clear all once an answer is picked', () => {
    const markup = view('/gb/filters?days=2')

    expect(markup).toContain('filters.chrome.show_classes(41)')
    expect(markup).toContain('filters.chrome.clear')
    expect(markup).not.toContain('common.chrome.close')
  })

  it('says nothing matches, and offers the one removal that brings classes back', () => {
    facets.current = {
      counts: counts(0),
      relevance,
      recovery: { group: 'days', count: 37, patch: { daysOfWeek: [] } },
    }

    const markup = view('/gb/filters?days=7&time=evening')

    expect(markup).toContain('filters.chrome.no_match')
    expect(markup).toContain('filters.chrome.widen(37)')
    expect(markup).toContain('filters.chrome.clear')
    expect(markup).not.toContain('filters.chrome.show_classes')
  })

  it('makes Clear all the way out when no single removal helps', () => {
    facets.current = { counts: counts(0), relevance, recovery: null }

    const markup = view('/gb/filters?days=7&time=evening')

    expect(markup).toContain('filters.chrome.no_match')
    expect(markup).not.toContain('filters.chrome.widen')
    expect(markup).not.toContain('common.chrome.close')
    expect(markup).toMatch(/flex-1[^>]*>filters\.chrome\.clear</)
  })
})
