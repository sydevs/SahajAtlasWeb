import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EventSkeleton, FieldSkeleton, ListSkeleton, TitleSkeleton } from './Skeleton'

// Node-only SSR assertions (see `docs/testing.md`): i18next echoes the key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const rows = (html: string) => html.match(/<li /g)?.length ?? 0

describe('ListSkeleton', () => {
  it('says it is finding classes once, in words a screen reader reads and nobody sees', () => {
    const html = renderToStaticMarkup(<ListSkeleton />)

    expect(html).toContain('role="status"')
    expect(html).toContain('sr-only')
    expect(html.match(/common\.chrome\.finding_classes/g)).toHaveLength(1)
  })

  it('draws place rows at a place row’s height, with a count and the chevron', () => {
    const html = renderToStaticMarkup(<ListSkeleton rows={4} />)

    expect(rows(html)).toBe(4)
    expect(html).toContain('min-h-14')
    expect(html).toContain('lucide-chevron-right')
  })

  it('marks each country row with a flag-shaped circle only when asked', () => {
    expect(renderToStaticMarkup(<ListSkeleton icons />)).toContain('rounded-full')
    expect(renderToStaticMarkup(<ListSkeleton />)).not.toContain('rounded-full')
  })

  it('draws class cards, three lines each, for a list of classes', () => {
    const html = renderToStaticMarkup(<ListSkeleton rows={2} variant="classes" />)

    expect(rows(html)).toBe(2)
    expect(html).not.toContain('min-h-14')
  })

  it('hides every bar from assistive tech', () => {
    expect(renderToStaticMarkup(<ListSkeleton />)).toContain('aria-hidden="true"')
  })
})

describe('FieldSkeleton', () => {
  it('adds the location line under the field only when asked', () => {
    expect(renderToStaticMarkup(<FieldSkeleton prompt />)).toContain('bg-secondary-3')
    expect(renderToStaticMarkup(<FieldSkeleton />)).not.toContain('bg-secondary-3')
  })
})

describe('TitleSkeleton', () => {
  it('reserves the Back row’s height above the title when asked', () => {
    expect(renderToStaticMarkup(<TitleSkeleton back />)).toContain('min-h-8')
    expect(renderToStaticMarkup(<TitleSkeleton />)).not.toContain('min-h-8')
  })
})

describe('EventSkeleton', () => {
  it('leaves Register out where the real one pins to the screen’s foot', () => {
    const withActions = renderToStaticMarkup(<EventSkeleton />)
    const without = renderToStaticMarkup(<EventSkeleton actions={false} />)

    expect(withActions).toContain('h-11')
    expect(without).not.toContain('h-11')
  })
})
