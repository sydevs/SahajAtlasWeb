import type { ReactNode } from 'react'

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { PanelSkeletonBody, panelShape } from './PanelSkeleton'
import { BootFallback } from './BootFallback'

import { ListItem } from '@/components/molecules/ListItem'
import { EventListItem } from '@/components/molecules/EventListItem'
import { resolveStack } from '@/lib/shape/path'
import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). Every key renders as itself.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
// The class card's own hooks, stubbed as EventListItem.test.tsx stubs them.
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
vi.mock('@/components/molecules/EventChips', () => ({ EventChips: () => null }))

const shapeAt = (path: string) => panelShape(resolveStack(path).at(-1))
const routed = (node: ReactNode) =>
  renderToStaticMarkup(<MemoryRouter initialEntries={['/']}>{node}</MemoryRouter>)

describe('panelShape', () => {
  it.each([
    ['/', { header: 'field', body: 'places' }],
    ['/search', { header: 'field', body: 'classes' }],
    ['/gb', { header: 'titled-field', body: 'places' }],
    ['/gb/south-east', { header: 'titled-field', body: 'places' }],
    ['/gb/south-east/london', { header: 'titled-field', body: 'classes' }],
    ['/gb/online', { header: 'titled', body: 'classes' }],
    ['/gb/south-east/london/1817', { header: 'titled', body: 'class' }],
  ])('%s loads as %o', (path, shape) => {
    expect(shapeAt(path)).toEqual(shape)
  })

  it.each(['/calendar', '/gb/south-east/london/1817/register', '/gb/south-east/london/1817/share'])(
    '%s has no shape: its data is on hand, so its own header over a spinner stands',
    (path) => {
      expect(shapeAt(path)).toBeNull()
    },
  )

  it('trusts the region tree over the route once it has the level', () => {
    const prague = resolveStack('/cz/prague').at(-1)

    expect(panelShape(prague)?.body).toBe('places')
    expect(panelShape(prague, 'city')?.body).toBe('classes')
  })
})

describe('PanelSkeletonBody', () => {
  it.each(['places', 'classes', 'class'] as const)(
    'says it is loading once, hides its shapes, and holds the sheet (%s)',
    (body) => {
      const html = renderToStaticMarkup(<PanelSkeletonBody body={body} />)

      expect(html.split('role="status"').length - 1).toBe(1)
      expect(html).toContain('aria-hidden="true"')
      expect(html).toContain('data-sy-loading')
    },
  )

  it('leaves Register out where it pins to the sheet foot', () => {
    expect(renderToStaticMarkup(<PanelSkeletonBody body="class" />)).toContain('h-10 w-full')
    expect(renderToStaticMarkup(<PanelSkeletonBody body="class" cta={false} />)).not.toContain(
      'h-10 w-full',
    )
  })
})

// The rows carry no shared constant with the real ones, so this is what keeps a restyle of a real
// row from making its placeholder jump: the tokens that set a row's height must agree.
describe('the placeholder rows stand at the real rows’ height', () => {
  const HEIGHT = /^(min-h-\S+|py-\S+|pt-\S+|pb-\S+)$/
  const heightOf = (classes: string) =>
    classes
      .split(' ')
      .filter((name) => HEIGHT.test(name))
      .sort()
  const firstRow = (html: string, tag: string) =>
    html.match(new RegExp(`<${tag} [^>]*class="([^"]*)"`))?.[1] ?? ''

  it('a place row', () => {
    const real = routed(<ListItem count={12} href="/gb" label="United Kingdom" />)
    const placeholder = renderToStaticMarkup(<PanelSkeletonBody body="places" />)

    expect(heightOf(firstRow(placeholder, 'li'))).toEqual(heightOf(firstRow(real, 'a')))
  })

  it('a class card', () => {
    const real = routed(<EventListItem event={mockEventSlim} />)
    const placeholder = renderToStaticMarkup(<PanelSkeletonBody body="classes" />)

    expect(heightOf(firstRow(placeholder, 'li'))).toEqual(heightOf(firstRow(real, 'a')))
  })
})

describe('BootFallback', () => {
  const boot = (path: string) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <BootFallback />
      </MemoryRouter>,
    )

  it('draws a route with a shape as that shape', () => {
    const city = boot('/gb/south-east/london')

    expect(city).toContain('common.a11y.finding_classes')
    expect(city).toContain('py-4')
  })

  it('draws a route with no shape as an empty titled panel', () => {
    const calendar = boot('/calendar')

    expect(calendar).not.toContain('role="status"')
    expect(calendar).not.toContain('data-sy-loading')
  })
})
