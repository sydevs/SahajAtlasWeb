import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { InactiveListingRow } from './InactiveListing'

import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`), mocked at the boundary like EventListItem's:
// i18next echoes the key and the city, and the map controller, the prefetch and the chips (which
// pull the resolver and React Query) are stubbed.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: { city?: string }) => (values?.city ? `${key}:${values.city}` : key),
  }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
vi.mock('@/components/molecules/EventChips', () => ({ EventChips: () => null }))

const inactive = { ...mockEventSlim, title: 'Meditation at 50 Murray Pl', inactive: true }

const render = (event: typeof inactive) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <InactiveListingRow event={event} />
    </MemoryRouter>,
  )

describe('InactiveListingRow', () => {
  it('names the town, not the title its host typed (Devindra, 12 Nov)', () => {
    const html = render(inactive)

    expect(html).toContain('event.display.inactive_title:Cambridge')
    expect(html).not.toContain('Murray Pl')
  })

  it('says to call, in place of a time and an address', () => {
    expect(render(inactive)).toContain('event.display.inactive_hint')
  })

  it('keeps its own title when no town is known', () => {
    const html = render({ ...inactive, address: null, region: { ...inactive.region, name: null } })

    expect(html).toContain('Meditation at 50 Murray Pl')
  })

  it('is a row of the list, opening the listing', () => {
    const html = render(inactive)

    expect(html).toMatch(/^<li><a[\s>]/)
    expect(html).toContain('data-event-row')
    expect(html).toContain(`href="${inactive.path}"`)
  })
})
