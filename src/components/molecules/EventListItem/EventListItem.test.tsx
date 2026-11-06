import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, it, expect, vi } from 'vitest'

import { EventListItem } from './EventListItem'

import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). The card must be a
// valid direct child of the List's <ul>: an <li> wrapping the <Link>/<a>,
// not <a><li> (#65). This mocks the hooks and child that would otherwise
// pull in i18next, react-query (the online-event IP lookup), and the map
// controller. This test exercises the DOM nesting and the resolved class
// list, not visuals. MemoryRouter supplies the router context (internal
// Link and useSearchParams).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { distance?: string; place?: string }) =>
      [key, values?.distance, values?.place].filter(Boolean).join(' | '),
  }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
// Prefetch-on-hover pulls react-query and the config/api chain, which
// leads to i18next. Stub it out, so this stays a DOM-nesting-only SSR
// assertion.
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
// Renders only the distance slot, which is the card's own line.
vi.mock('@/components/molecules/EventFacts', () => ({
  EventFacts: ({ distance }: { distance?: React.ReactNode }) => <span>{distance}</span>,
}))
// EventChips pulls the display resolver and i18n. The card's chips are not
// what this DOM-nesting test asserts. So stub it out, like EventFacts.
vi.mock('@/components/molecules/EventChips', () => ({
  EventChips: () => null,
}))

describe('EventListItem', () => {
  it('nests as <li><a> so the card is a direct child of the list <ul>', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EventListItem event={mockEventSlim} />
      </MemoryRouter>,
    )

    // <li> is the outermost element and wraps the anchor: <li><a>…</a></li>.
    expect(html.startsWith('<li>')).toBe(true)
    expect(html).toMatch(/^<li><a[\s>]/)
    expect(html.trimEnd().endsWith('</a></li>')).toBe(true)
    // The anchor must NOT be the outer element (the invalid <a><li> nesting).
    expect(html).not.toMatch(/^<a[\s>]/)
  })

  it('marks the anchor as the row, so the results list can focus a revealed card', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EventListItem event={mockEventSlim} />
      </MemoryRouter>,
    )

    // DynamicEventsList queries `[data-event-row]`, to move focus onto the
    // first newly revealed card when a "show more" press unmounts its
    // button. JSX does not type-check hyphenated attributes. So this test
    // is the only thing standing between a rename here and focus silently
    // dropping to <body> there.
    expect(html).toContain('data-event-row')
  })

  it('left-aligns the card column beside a chevron, as a place row has', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EventListItem event={mockEventSlim} />
      </MemoryRouter>,
    )

    // The row is the Link: its content sits in one left-aligned column, then the chevron.
    expect(html).toContain('flex min-w-0 flex-1 flex-col gap-1')
    expect(html).toContain('lucide-chevron-right')
  })
})

describe('EventListItem distance', () => {
  const far = { ...mockEventSlim, eventType: 'offline' as const, distance: 12 }
  const render = (props: Partial<Parameters<typeof EventListItem>[0]> = {}) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <EventListItem event={far} {...props} />
      </MemoryRouter>,
    )

  afterEach(() => vi.unstubAllGlobals())

  it('says where it counts from: the searched place, the centre, or the visitor', () => {
    // A browser that names no region, so the distance stays in kilometres.
    vi.stubGlobal('navigator', { languages: ['en'] })

    expect(render({ searchedPlace: 'Brussels' })).toContain(
      'event.display.distance_from_place | 12 km | Brussels',
    )
    expect(render({ distanceFrom: 'centre' })).toContain('event.display.distance_from_centre')
    expect(render({ distanceFrom: 'you' })).toContain('event.display.distance_from_you')
  })

  it('shows no distance when there is no point to name, or the list hides it', () => {
    // A country with a weekday measures from wherever the map was: "132 km away" from nobody.
    expect(render()).not.toContain('event.display.distance')
    expect(render({ searchedPlace: 'Brussels', hideDistance: true })).not.toContain(
      'event.display.distance',
    )
  })

  it('counts in miles on a UK browser, as the filters do', () => {
    vi.stubGlobal('navigator', { languages: ['en-GB', 'en'] })

    expect(render({ distanceFrom: 'centre' })).toContain('7.5 mi')
  })
})
