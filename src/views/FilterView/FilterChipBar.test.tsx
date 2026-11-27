import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FilterChipBar } from './FilterChipBar'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

// Node-only SSR assertions (see `docs/testing.md`). Every menu is a closed portal here, so only the
// row and its buttons render, which is what these cases are about. The filters' state and the
// router are mocked at the boundary.
const state = vi.hoisted(() => ({
  filters: {} as EventFilters,
  search: '',
  canClear: false,
}))

vi.mock('./use-panel-filters', () => ({
  usePanelFilters: () => ({
    filters: state.filters,
    facets: undefined,
    write: () => {},
    canClear: state.canClear,
    clear: () => {},
    pickPlace: () => {},
    clearWhere: () => {},
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
vi.mock('react-i18next', async (original) => ({
  ...(await original<object>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', formatLocale: 'en-US', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-near-me', () => ({ useNearVisitor: () => false }))
vi.mock('@/views/shared', () => ({ useDrawerControl: () => ({ dismiss: () => {} }) }))

const render = (filters: Partial<EventFilters> = {}, search = '') => {
  state.filters = { ...DEFAULT_FILTERS, ...filters }
  state.search = search
  state.canClear = Object.keys(filters).some((key) => key !== 'region')

  return renderToStaticMarkup(<FilterChipBar placement="map" />)
}

const buttons = (html: string) => html.match(/<button[^>]*>.*?<\/button>/g) ?? []
const filled = (button?: string) => Boolean(button?.includes('bg-primary-12'))

describe('FilterChipBar — nothing chosen', () => {
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

describe('FilterChipBar — Tuesday evening, online', () => {
  const html = render({ daysOfWeek: [2], timeOfDay: ['evening'], format: 'online' })
  const [clear, where, when] = buttons(html)

  it('puts Clear first in the row', () => {
    expect(clear).toContain('filters.chrome.clear_one')
  })

  it('fills each answered button and names its answer', () => {
    expect(filled(where)).toBe(true)
    expect(where).toContain('filters.format.online')
    expect(filled(when)).toBe(true)
    expect(when).toContain('Tue · filters.time.evening')
  })

  it('says the question before the answer to a screen reader', () => {
    expect(when).toMatch(/<span class="sr-only">filters\.when\.label: <\/span>Tue · /)
  })
})

describe('FilterChipBar — Where on a place page', () => {
  it('names the place without filling it', () => {
    const [where] = buttons(render({ region: 'gb' }))

    expect(where).toContain('United Kingdom')
    expect(filled(where)).toBe(false)
  })

  it('fills for a searched place, by its first part', () => {
    const [where] = buttons(render({}, '?q=London,+UK&center=-0.1,51.5'))

    expect(where).toContain('London')
    expect(where).not.toContain('UK')
    expect(filled(where)).toBe(true)
  })
})
