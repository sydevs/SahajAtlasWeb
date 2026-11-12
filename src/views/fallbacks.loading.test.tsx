import type { RegionNode } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { DrawerLoading } from './fallbacks'

import { regionsQuery } from '@/config/api'

// Node-only SSR assertions (see `docs/testing.md`): a place's loading placeholder, before its
// page arrives — whether its list is drawn as place rows or class cards, and what its title says.
// The chrome around it is stubbed; the list stub prints which kind it was asked for.
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ regionNames: new Intl.DisplayNames(['en'], { type: 'region' }) }),
}))
vi.mock('@/components/atoms/Drawer', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>

  return { DrawerBody: Pass, DrawerHeader: Pass, DrawerToolbar: Pass }
})
vi.mock('@/components/molecules', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/molecules')>()),
  ListSkeleton: ({ variant = 'places' }: { variant?: string }) => <i data-list={variant} />,
  FieldSkeleton: () => null,
  ListToolbar: () => null,
  TitleSkeleton: () => <i data-title-skeleton="" />,
}))
vi.mock('@/views/nav', () => ({
  BackButton: () => null,
  Breadcrumbs: () => null,
  NavHeader: () => null,
  NavRow: () => null,
}))
vi.mock('@/views/shared', () => ({
  CalendarButton: () => null,
  DrawerTitle: ({ title }: { title: string }) => <h2>{title}</h2>,
  ExpandSheetButton: () => null,
  FilterButton: () => null,
  MapButton: () => null,
  SearchButton: () => null,
  SearchField: () => null,
  useDrawerControl: () => ({ collapsed: false }),
}))

const node = (id: number, slug: string, level: RegionNode['level'], parent?: number) =>
  ({ id, slug, name: slug, level, parent }) as RegionNode

const loading = (path: string, tree?: RegionNode[]) => {
  const client = new QueryClient()

  if (tree) client.setQueryData(regionsQuery().queryKey, tree)

  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <DrawerLoading />
      </QueryClientProvider>
    </MemoryRouter>,
  )

  return {
    list: html.match(/data-list="(\w+)"/)?.[1],
    title: html.match(/<h2>([^<]*)<\/h2>/)?.[1],
  }
}

const TREE = [
  node(1, 'gb', 'country'),
  node(2, 'south-east', 'region', 1),
  node(3, 'london', 'city', 2),
  node(4, 'prague', 'city'),
]

describe('a place loading', () => {
  it('draws class cards for a city and place rows above it, once the region tree is in', () => {
    expect(loading('/gb/south-east/london', TREE).list).toBe('classes')
    expect(loading('/cz/prague', TREE).list).toBe('classes')
    expect(loading('/gb/south-east', TREE).list).toBe('places')
    expect(loading('/gb', TREE).list).toBe('places')
  })

  it('guesses from the route before the tree arrives', () => {
    expect(loading('/gb/south-east/london').list).toBe('classes')
    expect(loading('/gb/south-east').list).toBe('places')
  })

  it('names a country at once, without the region tree', () => {
    expect(loading('/gb').title).toBe('United Kingdom')
  })
})
