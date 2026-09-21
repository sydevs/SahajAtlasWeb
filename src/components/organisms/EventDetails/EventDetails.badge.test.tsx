import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { EventListItem } from '@/components/molecules/EventListItem'
import { mockEvent, mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). The panel and the card are asserted
// together, from one stage value, because the property under test is the difference
// between them: the badge belongs to the event page, and the card must stay unmarked.
//
// ⚠ `EventChips` is deliberately NOT stubbed, unlike in the card's own spec. The panel
// and the card share it, so a badge added there would reach both — stubbing it is
// exactly how the card's half of this pair would go vacuous.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
// The chips' display resolver reads the viewer's rough location through react-query.
// Mocked at that leaf rather than by stubbing the chips, for the reason above.
vi.mock('@/hooks/use-ip-location', () => ({
  useIpLocation: () => null,
}))
// Register and the secondary actions pull react-query and the registration chain.
// Neither is what this asserts. Register and the facts render a marker rather than
// null, because the badge's POSITION between the two is half of what is asserted
// below, and a null stub leaves nothing to order against.
vi.mock('./EventRegister', () => ({
  EventRegisterBar: () => <i>register-slot</i>,
}))
vi.mock('@/components/molecules/EventActions', () => ({
  EventActions: () => null,
}))
vi.mock('@/components/molecules/EventFacts', () => ({
  EventFacts: () => <i>facts-slot</i>,
}))
// DOMPurify binds a real `window` at module scope, so importing the panel would need a
// DOM the rest of this file does not. `sanitize.test.ts` owns that allowlist.
vi.mock('./sanitize', () => ({
  sanitizeDescription: (html: string) => html,
}))

const TITLE_KEY = 'event.display.unverified_title'
const NOTE_KEY = 'event.display.unverified_note'

const panel = (verificationStage: string | null) =>
  renderToStaticMarkup(
    <EventDetails basePath="/gb/london/1" event={{ ...mockEvent, verificationStage }} />,
  )

// ⚠ The card's chips are `compact`, and that variant drops the plain weekly type and the
// viewer's own language — for the stock fixture it renders NOTHING, which would make the
// absence assertion below pass against a badge that really was there. A second language
// is what puts chips on screen for it to miss.
const card = (verificationStage: string | null) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <EventListItem event={{ ...mockEventSlim, languages: ['fr'], verificationStage }} />
    </MemoryRouter>,
  )

describe('unverified badge', () => {
  it('renders on the event page for an unverified listing', () => {
    const markup = panel('unverified')

    expect(markup).toContain(TITLE_KEY)
    expect(markup).toContain(NOTE_KEY)
  })

  // The four managed rungs, plus the tolerant schema's visible half: a stage SahajCloud
  // adds later reaches the panel, carries no badge, and never throws to the boundary.
  // `'unverified'` is a substring of both keys, so one assertion covers them.
  it.each(['verified', 'reminded', 'escalated', 'urgent', 'some-future-stage', null])(
    'renders no badge for %s',
    (stage) => {
      expect(panel(stage)).not.toContain('unverified')
    },
  )

  it('never marks the list card, for an unverified listing', () => {
    expect(card('unverified')).not.toContain('unverified')
  })

  // The caveat belongs to the decision to join, not to the top of the panel: a long
  // event page scrolls it out of sight long before the button. Both bounds are needed
  // — against the facts alone it also passes from the old position above the chips.
  it('sits between the event facts and Register', () => {
    const markup = panel('unverified')

    expect(markup.indexOf(TITLE_KEY)).toBeGreaterThan(markup.indexOf('facts-slot'))
    expect(markup.indexOf(TITLE_KEY)).toBeLessThan(markup.indexOf('register-slot'))
  })

  // The mobile map sheet pins Register in the drawer footer instead, so the inline bar
  // is absent. The caveat is not the button's, and must survive without it.
  it('renders with Register pinned to the sheet footer', () => {
    const markup = renderToStaticMarkup(
      <EventDetails
        basePath="/gb/london/1"
        event={{ ...mockEvent, verificationStage: 'unverified' }}
        registerInline={false}
      />,
    )

    expect(markup).toContain(TITLE_KEY)
    expect(markup).not.toContain('register-slot')
  })
})
