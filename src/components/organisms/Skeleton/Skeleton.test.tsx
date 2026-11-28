import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { SkeletonBody, skeletonShape } from './Skeleton'

import { BootFallback } from '@/views/BootFallback'
import { resolveStack } from '@/lib/shape/path'

// Node-only SSR assertions (see `docs/testing.md`). Every key renders as itself.
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const shapeAt = (path: string) => skeletonShape(resolveStack(path).at(-1))

describe('skeletonShape', () => {
  it.each([
    ['/', { header: 'home', body: 'places' }],
    ['/search', { header: 'search', body: 'classes' }],
    ['/gb', { header: 'titled-field', body: 'places' }],
    ['/gb/south-east', { header: 'titled-field', body: 'places' }],
    ['/gb/south-east/london', { header: 'titled-field', body: 'classes' }],
    ['/gb/online', { header: 'titled', body: 'classes' }],
    ['/gb/south-east/london/1817', { header: 'class', body: 'class' }],
    ['/calendar', { header: 'calendar', body: 'calendar' }],
    ['/filters', { header: 'closable', body: 'filters' }],
    ['/gb/south-east/london/1817/register', { header: 'titled-subtitle', body: 'form' }],
    // A retired share link opens its class.
    ['/gb/south-east/london/1817/share', { header: 'class', body: 'class' }],
  ])('%s loads as %o', (path, shape) => {
    expect(shapeAt(path)).toEqual(shape)
  })

  it('trusts the region tree over the route once it has the level', () => {
    const prague = resolveStack('/cz/prague').at(-1)

    expect(skeletonShape(prague).body).toBe('places')
    expect(skeletonShape(prague, 'city').body).toBe('classes')
  })
})

describe('SkeletonBody', () => {
  it.each(['places', 'classes', 'class', 'form', 'filters', 'calendar'] as const)(
    'says it is loading once, hides its shapes, and holds the sheet (%s)',
    (body) => {
      const html = renderToStaticMarkup(<SkeletonBody body={body} />)

      expect(html.split('role="status"').length - 1).toBe(1)
      expect(html).toContain('aria-hidden="true"')
      expect(html).toContain('data-sy-loading')
    },
  )

  it('leaves Register out where it pins to the sheet foot', () => {
    expect(renderToStaticMarkup(<SkeletonBody body="class" />)).toContain('h-12 w-full')
    expect(renderToStaticMarkup(<SkeletonBody body="class" cta={false} />)).not.toContain(
      'h-12 w-full',
    )
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

  it('clips its placeholder body, in place of the body slot’s own scrolling', () => {
    // The drawer's body slot, by the footer spacer only it carries.
    const body = boot('/gb/south-east/london').match(
      /class="([^"]*after:h-\[var\(--sy-footer-h[^"]*)"/,
    )?.[1]

    expect(body).toContain('overflow-y-clip')
    expect(body).not.toContain('overflow-y-auto')
  })
})

describe('the primitives', () => {
  it('hide their shapes from assistive tech, pulsing unless motion is reduced', async () => {
    const { SkeletonGroup, SkeletonLine } = await import('./Skeleton')
    const html = renderToStaticMarkup(
      <SkeletonGroup>
        <SkeletonLine className="text-lg" />
      </SkeletonGroup>,
    )

    expect(html).toMatch(/^<div aria-hidden="true" class="motion-safe:animate-pulse/)
    // A real line box at the text size it stands for.
    expect(html).toContain('text-lg')
    expect(html).toContain('\u200b')
  })
})
