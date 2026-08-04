import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'

import { EventListItem } from './EventListItem'

import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `.claude/rules/tests.md`). The card must be a valid
// direct child of the List's <ul>: an <li> wrapping the <Link>/<a>, not <a><li>
// (#65). Mock the hooks/child that would otherwise pull in i18next, react-query
// (the online-event IP lookup) and the map controller — this test exercises the
// DOM nesting and the resolved class list, not visuals. MemoryRouter supplies
// the router context (internal Link + useSearchParams).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en' }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
// Prefetch-on-hover pulls react-query + the config/api chain (→ i18next); stub it out
// so this stays a DOM-nesting-only SSR assertion.
vi.mock('@/hooks/use-prefetch-event', () => ({
  usePrefetchEvent: () => () => {},
}))
vi.mock('@/components/molecules/EventFacts', () => ({
  EventFacts: () => null,
}))
// EventChips pulls the display resolver + i18n; the card's chips aren't what this
// DOM-nesting test asserts, so stub it out (like EventFacts).
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

    // DynamicEventsList queries `[data-event-row]` to move focus onto the first newly
    // revealed card when a "show more" press unmounts its button. JSX doesn't
    // type-check hyphenated attributes, so this is the only thing standing between a
    // rename here and focus silently dropping to <body> there.
    expect(html).toContain('data-event-row')
  })

  it('left-aligns the card column: listRow items-stretch beats the Link atom items-center', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <EventListItem event={mockEventSlim} />
      </MemoryRouter>,
    )

    // The first class attribute is the card anchor's (the <li> wrapper is bare).
    const classes = (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

    expect(classes).toContain('flex-col')
    expect(classes).toContain('items-stretch')
    // The Link atom's inline-link `items-center` must lose the merge — on a
    // flex-col card it centers every line of content.
    expect(classes).not.toContain('items-center')
  })
})
