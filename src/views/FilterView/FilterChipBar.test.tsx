import type { FilterFacets } from '@/hooks/use-filter-facets'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { FilterChipBar } from './FilterChipBar'

// Node-only SSR assertions (see `docs/testing.md`). Closed popovers render only their chips, so
// what is under test is the bar itself: which chips it offers, and what an answered one says.
const facets = vi.hoisted(() => ({ current: undefined as FilterFacets | undefined }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [{ slug: 'gb', name: 'United Kingdom' }] }),
}))
vi.mock('@/config/api', () => ({
  default: {},
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageLabel: (code: string) => code.toUpperCase() }),
}))
vi.mock('@/hooks/use-filter-facets', () => ({ useFilterFacets: () => facets.current }))
vi.mock('./WhereFilter', () => ({ WhereFilter: () => null }))

const counts = (languages: FilterFacets['counts']['languages']): FilterFacets => ({
  counts: {
    total: 10,
    format: { offline: 8, online: 2 },
    days: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 0, 7: 0 },
    time: { morning: 2, afternoon: 1, evening: 7, night: 0 },
    cadence: { DAILY: 0, WEEKLY: 10, MONTHLY: 0, once: 0 },
    languages,
  },
  relevance: { format: true, days: true, time: true, cadence: false, languages: false },
})

const bar = (entry: string, scope = counts([{ code: 'en', count: 10 }])) => {
  facets.current = scope

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <FilterChipBar />
    </MemoryRouter>,
  )
}

describe('FilterChipBar — the chips', () => {
  it('offers Where, When and Language, with nothing open', () => {
    const html = bar('/search')

    expect(html).toContain('filters.where.label')
    expect(html).toContain('filters.when.label')
    expect(html).toContain('filters.language.label')
    expect(html).not.toContain('role="dialog"')
  })

  it('keeps Language where every class speaks one', () => {
    expect(bar('/gb')).toContain('filters.language.label')
  })

  it('has no Language chip with no language to offer', () => {
    expect(bar('/search', counts([]))).not.toContain('filters.language.label')
  })

  it('offers Clear only once a question is answered', () => {
    expect(bar('/search')).not.toContain('filters.chrome.clear_one')
    expect(bar('/search?days=2')).toContain('filters.chrome.clear_one')
  })
})

describe('FilterChipBar — an answered chip', () => {
  it('names the day and time under When, and keeps the question for screen readers', () => {
    const html = bar('/search?days=2,3&time=evening')

    expect(html).toMatch(
      /<span class="sr-only">filters\.when\.label: <\/span>Tue, Wed · filters\.time\.evening/,
    )
  })

  it('names the place and the format under Where', () => {
    expect(bar('/gb?format=online')).toContain('United Kingdom · filters.format.online')
  })

  it('names the chosen languages under Language', () => {
    expect(bar('/search?langs=cs,en')).toContain('CS, EN')
  })
})
