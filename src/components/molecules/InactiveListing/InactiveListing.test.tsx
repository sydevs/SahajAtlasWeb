import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { InactiveListingRow } from './InactiveListing'

import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`), mocked at the boundary like EventListItem's:
// i18next echoes the key and the city, and the map controller, the prefetch and the chips (which
// pull React Query) are stubbed. The when-line runs the real `useEventDisplay`.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: { city?: string }) => (values?.city ? `${key}:${values.city}` : key),
    i18n: { language: 'en' },
  }),
}))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
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

  it("reads the class page's own when-line, in place of a time and an address", () => {
    const html = render(inactive)

    expect(html).toContain('event.display.contact_for_timing')
    expect(html).not.toContain('inactive_hint')
  })

  it('promises no phone call: the feed does not say how the host can be reached', () => {
    // lucide marks each glyph with its own class; a phone glyph here would promise a call to a
    // listing whose only contact may be a website.
    const html = render(inactive)

    expect(html).not.toContain('lucide-phone')
    expect(html).toContain('lucide-calendar-days')
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
