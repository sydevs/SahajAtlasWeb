import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HiddenByFilters, NoFilterMatches } from './FilterNotes'

import { DEFAULT_FILTERS, type FilterRecovery } from '@/lib/shape'

// Node-only SSR assertions (see `docs/testing.md`). Copy, the URL filters and the counts are mocked
// at the boundary, so each case says only what the line offers.
let recovery: FilterRecovery | null = null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.values(values).join(',')})` : key,
  }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    t: (key: string) => key,
    formatLocale: 'en-US',
    languageLabel: (code: string) => code,
  }),
}))
vi.mock('@/hooks/use-filters', () => ({
  useEventFilters: () => ({ ...DEFAULT_FILTERS, daysOfWeek: [1] }),
  useSetFilters: () => ({ clearFilters: () => {}, setFilters: () => {} }),
}))
vi.mock('@/hooks/use-filter-facets', () => ({
  useFilterFacets: () => ({ recovery }),
}))

beforeEach(() => {
  recovery = null
})

describe('NoFilterMatches', () => {
  it('offers the one removal before Clear filters', () => {
    recovery = { group: 'days', count: 3, patch: { daysOfWeek: [] } }
    const html = renderToStaticMarkup(<NoFilterMatches />)

    expect(html).toContain('filters.chrome.no_results_classes')
    expect(html.indexOf('filters.chrome.widen')).toBeGreaterThan(-1)
    expect(html.indexOf('filters.chrome.widen')).toBeLessThan(html.indexOf('filters.chrome.clear'))
  })

  it('leaves Clear filters as the only way out when no single removal helps', () => {
    const html = renderToStaticMarkup(<NoFilterMatches />)

    expect(html).not.toContain('filters.chrome.widen')
    expect(html).toContain('filters.chrome.clear')
  })
})

describe('HiddenByFilters', () => {
  it('names how many classes clearing brings back, then offers it', () => {
    const html = renderToStaticMarkup(<HiddenByFilters count={4} />)

    expect(html).toContain('filters.chrome.more_area(4)')
    expect(html).toContain('filters.chrome.clear')
  })
})
