import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'

import { EventListItem } from './EventListItem'

import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `.claude/rules/tests.md`). The card must be a valid
// direct child of the List's <ul>: an <li> wrapping the <Link>/<a>, not <a><li>
// (#65). Mock the hooks/child that would otherwise pull in i18next, react-query
// (the online-event IP lookup) and the map controller — this test only exercises
// the DOM nesting. MemoryRouter supplies the router context (internal Link +
// useSearchParams).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    locale: 'en',
    languageCode: 'en',
    languageNames: { of: (code: string) => code },
  }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
// Prefetch-on-hover pulls react-query + the config/api chain (→ i18next); stub it out
// so this stays a DOM-nesting-only SSR assertion.
vi.mock('@/hooks/use-prefetch-event', () => ({
  usePrefetchEvent: () => () => {},
}))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({ display: { online: false }, typeLabel: '', isDefaultType: true }),
}))
vi.mock('@/components/molecules/EventFacts', () => ({
  EventFacts: () => null,
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
})
