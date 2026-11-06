import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EventView } from './EventView'

import { eventQuery } from '@/config/api'
import { WidgetWidthContext } from '@/config/responsive'
import { mockEvent } from '@/mocks/events'

// The class page's correction offer (#147) lives at the route, below the lazy panel, so it
// renders whether or not the panel's chunk has loaded — which under SSR it never has.
const livePreview = vi.hoisted(() => ({ active: false }))

vi.mock('@/config/live-preview/protocol', () => ({ default: livePreview }))
vi.mock('@/hooks/use-ip-location', () => ({ useIpLocation: () => null }))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))

const render = ({ wide = true }: { wide?: boolean } = {}) => {
  const client = new QueryClient()

  client.setQueryData(eventQuery(mockEvent.id, 'en').queryKey, mockEvent)

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WidgetWidthContext.Provider value={wide}>
        <MemoryRouter>
          <EventView basePath="/gb/oxford/507" id={mockEvent.id} />
        </MemoryRouter>
      </WidgetWidthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('EventView', () => {
  beforeEach(() => {
    livePreview.active = false
  })

  it('offers a correction to the class it shows', () => {
    const markup = render()

    expect(markup).toMatch(/href="[^"]*\/gb\/oxford\/507\/correct"/)
  })

  it('offers it under a live preview too, which the link guard inerts where it must', () => {
    livePreview.active = true

    expect(render()).toMatch(/href="[^"]*\/gb\/oxford\/507\/correct"/)
  })

  // Under SSR the lazy panel never loads, which is exactly the state #89 protects: the phone
  // sheet's Register bar must not wait for the panel's chunk. Once the panel loads, it takes the
  // bar into its own flow, after the facts (`EventDetails.cta.test.tsx`).
  it('keeps the phone sheet’s pinned Register bar while the panel is still loading', () => {
    const markup = render({ wide: false })

    expect(markup).toContain('data-sheet-footer')
    expect(markup.indexOf('data-sheet-footer')).toBeLessThan(markup.indexOf('/correct'))
  })

  it('pins no bar on a side panel, where Register stays inline', () => {
    expect(render({ wide: true })).not.toContain('data-sheet-footer')
  })
})
