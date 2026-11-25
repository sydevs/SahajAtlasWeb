import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { DrawerChrome } from './fallbacks'

// Chrome is stubbed with markers, not nulls, so the band can be told from the header.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('lucide-react', () => ({ Search: () => <i>magnifier</i> }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }))
vi.mock('@/config/api', () => ({
  eventTitlesQuery: () => ({ queryKey: ['titles'] }),
  regionQuery: () => ({ queryKey: ['region'] }),
  regionsQuery: () => ({ queryKey: ['regions'] }),
}))
vi.mock('@/config/mode', () => ({ useWidgetMode: () => ({ hasMap: true }) }))
vi.mock('@/hooks/use-atlas-navigate', () => ({ useAtlasNavigate: () => () => {} }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ frameRegion: () => {} }),
}))
vi.mock('@/components/atoms/Button', () => ({
  Button: ({ children, ...rest }: { children: ReactNode; 'aria-label'?: string }) => (
    <button aria-label={rest['aria-label']}>{children}</button>
  ),
}))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: ReactNode }) => <section>body:{children}</section>,
  DrawerHeader: ({ children }: { children: ReactNode }) => <div>geocoder-header:{children}</div>,
  DrawerToolbar: ({ children, field }: { children: ReactNode; field?: boolean }) => (
    <aside>
      {field ? 'field-toolbar' : 'toolbar'}:{children}
    </aside>
  ),
}))
vi.mock('@/components/atoms/Spinner', () => ({ Spinner: () => <i>spinner</i> }))
vi.mock('@/components/molecules', () => ({
  CENTERED_BODY: '',
  FallbackPanel: () => <i>fallback-panel</i>,
  ListToolbar: ({ children }: { children: ReactNode }) => <nav>{children}</nav>,
}))
vi.mock('@/views/nav', () => ({
  BackButton: () => <i>back-button</i>,
  NavHeader: ({ title, actions }: { title: ReactNode; actions: ReactNode }) => (
    <header>
      <h2>{title}</h2>
      {actions}
    </header>
  ),
}))
vi.mock('@/views/shared', () => ({
  CalendarButton: () => <i>calendar-button</i>,
  ExpandSheetButton: () => <i>expand-button</i>,
  FilterButton: () => <i>filter-button</i>,
  HEADER_CONTROL: {},
  HEADER_EDGE: '',
  SearchField: () => <i>search-field</i>,
}))

const chrome = (path: string, props: { interactive?: boolean; notFound?: boolean } = {}) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <DrawerChrome {...props} />
    </MemoryRouter>,
  )

describe('DrawerChrome — the band a place page arrives with', () => {
  it('carries the field under the header, and no magnifier in it', () => {
    const markup = chrome('/gb/south-east')

    expect(markup).toContain('<aside>field-toolbar:<i>search-field</i></aside>')
    expect(markup).not.toContain('magnifier')
  })

  it('fills the same band with the skeleton while the view loads', () => {
    const markup = chrome('/gb/south-east', { interactive: false })

    expect(markup).toContain('field-toolbar')
    expect(markup).toContain('placeholder="search.chrome.placeholder"')
    expect(markup).not.toContain('<i>search-field</i>')
  })

  it('leaves the band off a place that does not exist', () => {
    const markup = chrome('/gb/nowhere', { notFound: true })

    expect(markup).not.toContain('field-toolbar')
    expect(markup).not.toContain('search-field')
  })

  it('leaves the online roll-up on its magnifier', () => {
    const markup = chrome('/gb/south-east/online')

    expect(markup).toContain('aria-label="search.chrome.title"')
    expect(markup).toContain('magnifier')
    expect(markup).not.toContain('field-toolbar')
  })
})
