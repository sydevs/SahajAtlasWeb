import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { DrawerErrorFallback, DrawerLoading } from './fallbacks'

import { atlasError } from '@/lib/report'

// The chrome a view keeps while it loads or after it threw mirrors the loaded view's header,
// so nothing moves when the view arrives, and the body never draws a second search field under
// one the chrome already shows. Chrome is stubbed with markers so both read off the markup.
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', regionNames: { of: () => undefined } }),
}))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>body:{children}</section>
  ),
  DrawerHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DrawerToolbar: ({ children, field }: { children: ReactNode; field?: boolean }) => (
    <aside>
      {field ? 'field-toolbar' : 'toolbar'}:{children}
    </aside>
  ),
}))
vi.mock('@/components/molecules', () => ({
  CENTERED_BODY: '',
  FallbackPanel: ({ hasSearchChrome }: { hasSearchChrome?: boolean }) => (
    <i>{hasSearchChrome ? 'panel' : 'panel-with-search-field'}</i>
  ),
  ListToolbar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SortMenu: () => <i>sort-menu</i>,
}))
vi.mock('@/views/nav', () => ({
  BackButton: () => <i>back</i>,
  NavHeader: ({ actions }: { actions: ReactNode }) => <header>{actions}</header>,
  NavRow: () => <i>nav-row</i>,
}))
vi.mock('@/views/shared', () => ({
  CalendarButton: () => <i>calendar-button</i>,
  ExpandSheetButton: () => null,
  FilterButton: () => <i>filter-button</i>,
  SearchField: () => <i>search-field</i>,
  useDrawerControl: () => ({ collapsed: false }),
}))

const at = (path: string, view: ReactNode) =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{view}</MemoryRouter>)

const error = (kind: 'server' | 'not-found') => (
  <DrawerErrorFallback error={atlasError(kind, 'x')} resetErrorBoundary={() => {}} />
)

describe("a place page's loading and error chrome", () => {
  it('loads with the page header and the field band, the field drawn inert', () => {
    const markup = at('/gb/south-east', <DrawerLoading />)

    // The field's shape (`FieldSkeleton`), hidden from assistive tech, never a live field.
    expect(markup).toMatch(
      /^<header><i>calendar-button<\/i><i>filter-button<\/i><\/header><aside>field-toolbar:<div aria-hidden="true"/,
    )
    expect(markup).not.toContain('search-field')
    expect(markup).not.toMatch(/<input[\s>]/)
  })

  it('clips the placeholder body, which holds no stop a keyboard could scroll it from', () => {
    expect(at('/gb/south-east', <DrawerLoading />)).toContain('<section class="overflow-y-clip">')
  })

  it('fails with the same header, a live field, and no second field in the body', () => {
    const markup = at('/gb/south-east', error('server'))

    expect(markup).toMatch(
      /<header><i>calendar-button<\/i><i>filter-button<\/i><\/header><aside>field-toolbar:<i>search-field<\/i><\/aside><section>body:<i>panel<\/i>/,
    )
  })

  it('keeps the field band on a dead place link, with nothing to scope controls to', () => {
    const markup = at('/gb/nowhere', error('not-found'))

    expect(markup).toMatch(
      /<header><\/header><aside>field-toolbar:<i>search-field<\/i><\/aside><section>body:<i>panel<\/i>/,
    )
  })

  it('gives the online classes page no search control, as its view has none', () => {
    const markup = at('/gb/online', <DrawerLoading />)

    expect(markup).toMatch(/^<header><\/header><section class="overflow-y-clip">body:/)
  })

  it("leaves the root's field in its header, as CountriesView has it, and the body without one", () => {
    expect(at('/', error('server'))).toMatch(
      /^<header><i>search-field<\/i><i>filter-button<\/i><\/header><section>body:<i>panel<\/i>/,
    )
  })
})
