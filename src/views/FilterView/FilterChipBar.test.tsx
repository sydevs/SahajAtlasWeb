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

  // The row spans the map beside the panel: were it to take presses, every drag, pin click and pin
  // hover across that strip would land on nothing.
  it('leaves the map every press but the chips’ own', () => {
    const html = bar('/search?days=2')
    const row = html.match(/<div[^>]*role="group"[^>]*>/)?.[0] ?? ''
    const chips = html.match(/<div[^>]*role="button"[^>]*>/g) ?? []

    expect(row).toContain('pointer-events-none')
    expect(chips).toHaveLength(3)
    chips.forEach((chip) => expect(chip).toContain('pointer-events-auto'))
    expect(html).toMatch(
      /<button class="[^"]*\bpointer-events-auto\b[^"]*"[^>]*>.*filters\.chrome\.clear_one/,
    )
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

  // The place in scope is where the visitor is browsing, not a filter they chose (review, 13 Nov):
  // 'London' filled on every place page read as an answered question.
  it('names the place in scope unfilled, and fills Where only for a choice', () => {
    // The first chip, up to the second: Clear, when it shows, is a plain button before them.
    const whereChip = (entry: string) => bar(entry).split('role="button"')[1] ?? ''

    expect(whereChip('/gb')).toContain('United Kingdom')
    expect(whereChip('/gb')).not.toContain('bg-primary-9')
    expect(whereChip('/gb?format=online')).toContain('bg-primary-9')
    expect(whereChip('/search?q=Brighton&center=-0.14,50.82')).toContain('bg-primary-9')
  })

  it('names the chosen languages under Language', () => {
    expect(bar('/search?langs=cs,en')).toContain('CS, EN')
  })
})
