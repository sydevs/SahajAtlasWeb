import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FilterMenuBar } from './FilterMenuBar'

import { type FilterMenusProps } from '@/components/organisms/FilterMenus'
import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

// Node-only. The buttons themselves are `FilterMenus`' spec; this one pins what the view tells
// them about the place, from the router and the region tree, both mocked at the boundary.
const state = vi.hoisted(() => ({
  filters: {} as EventFilters,
  search: '',
  pathname: '/search',
  props: undefined as FilterMenusProps | undefined,
}))

vi.mock('@/components/organisms/FilterMenus', () => ({
  FilterMenus: (props: FilterMenusProps) => {
    state.props = props

    return null
  },
}))
vi.mock('@/hooks/use-filter-editor', () => ({
  useFilterEditor: () => ({ filters: state.filters, write() {}, clear() {}, pickPlace() {} }),
}))
vi.mock('react-router', async (original) => ({
  ...(await original<object>()),
  useLocation: () => ({ pathname: state.pathname }),
  useSearchParams: () => [new URLSearchParams(state.search)],
}))
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<object>()),
  useQuery: () => ({ data: [{ slug: 'gb', name: 'United Kingdom' }] }),
}))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-near-me', () => ({ useNearVisitor: () => false }))

const whereFor = (filters: Partial<EventFilters>, search = '', pathname = '/search') => {
  Object.assign(state, { filters: { ...DEFAULT_FILTERS, ...filters }, search, pathname })
  renderToStaticMarkup(<FilterMenuBar variant="floating" />)

  return state.props?.where
}

describe('FilterMenuBar — the place it hands the Where button', () => {
  it('names a place page, which is not an answer', () => {
    expect(whereFor({ region: 'gb' })).toMatchObject({
      place: 'United Kingdom',
      placeAnswered: false,
    })
  })

  it('names a searched place by its first part, which is an answer', () => {
    expect(whereFor({}, '?q=London,+UK&center=-0.1,51.5')).toMatchObject({
      place: 'London',
      placeAnswered: true,
    })
  })

  it('offers Near me everywhere but the calendar', () => {
    expect(whereFor({})?.always).toBe(true)
    expect(whereFor({}, '', '/calendar')?.always).toBe(false)
  })
})
