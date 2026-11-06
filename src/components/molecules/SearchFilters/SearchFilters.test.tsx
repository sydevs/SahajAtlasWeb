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
  default: { getGeojson: () => Promise.resolve(undefined) },
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))

const render = (filters = DEFAULT_FILTERS) =>
  renderToStaticMarkup(<SearchFilters value={filters} onChange={() => {}} />)

const scopeCounts = {
  total: 10,
  format: { offline: 10, online: 0 },
  days: { 1: 10, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
  time: { morning: 4, afternoon: 0, evening: 6 },
  cadence: { DAILY: 0, WEEKLY: 10, MONTHLY: 0, once: 0 },
  languages: [{ code: 'en', count: 10 }],
}
const facets = {
  counts: scopeCounts,
  relevance: { format: false, days: false, time: true, cadence: false, languages: false },
}

describe('SearchFilters — only what can change the results', () => {
  const withFacets = (filters = DEFAULT_FILTERS) =>
    renderToStaticMarkup(<SearchFilters facets={facets} value={filters} onChange={() => {}} />)

  it('shows every group while the feed is loading', () => {
    const html = render()

    expect(html).toContain('filters.format.question')
    expect(html).toContain('filters.days.short_label')
    expect(html).toContain('filters.time.label')
  })

  it('drops the groups that could not narrow this scope', () => {
    const html = withFacets()

    expect(html).not.toContain('filters.format.question')
    expect(html).not.toContain('filters.days.short_label')
    expect(html).not.toContain('filters.language.label')
    expect(html).toContain('filters.time.label')
  })

  it('keeps a group that is in use, so it can be undone', () => {
    const html = withFacets({ ...DEFAULT_FILTERS, format: 'online' })

    expect(html).toContain('filters.format.question')
  })
})

describe('SearchFilters — More filters', () => {
  it('is folded by default', () => {
    const html = render()

    expect(html).toContain('filters.more.label')
    expect(html).not.toContain('filters.dates.from')
  })

  it('opens by itself when one of its filters is set', () => {
    const html = render({ ...DEFAULT_FILTERS, cadence: 'WEEKLY' })

    expect(html).toContain('filters.dates.from')
  })
})
