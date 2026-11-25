import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EventListItemSkeleton } from './EventListItemSkeleton'

// Node-only SSR assertions (see `docs/testing.md`).
describe('EventListItemSkeleton', () => {
  it('draws the where line with the monitor for an online class, as the card does', () => {
    const inPerson = renderToStaticMarkup(<EventListItemSkeleton />)
    const online = renderToStaticMarkup(<EventListItemSkeleton online />)

    expect(inPerson).toContain('lucide-map-pin')
    expect(online).toContain('lucide-monitor')
    expect(online).not.toContain('lucide-map-pin')
  })

  it('offers nothing to press or focus', () => {
    expect(renderToStaticMarkup(<EventListItemSkeleton />)).not.toMatch(/<(a|button)[\s>]/)
  })
})
