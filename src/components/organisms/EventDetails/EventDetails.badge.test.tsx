import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { EventListItem } from '@/components/molecules/EventListItem'
import { mockEvent, mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). The panel and the card render from
// ONE fixture here, because the property under test is the difference between them:
// the badge belongs to the event page, and the list card must stay unmarked.
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
// Neither is what this asserts.
vi.mock('./EventRegister', () => ({
  EventRegisterBar: () => null,
}))
vi.mock('@/components/molecules/EventActions', () => ({
  EventActions: () => null,
}))
vi.mock('@/components/molecules/EventFacts', () => ({
  EventFacts: () => null,
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

  // The reminder ladder is managed: a manager already vouched for the event before it
  // reached any of these stages, so none of them is badged.
  it.each(['verified', 'reminded', 'escalated', 'urgent'])('renders for no %s listing', (stage) => {
    expect(panel(stage)).not.toContain('unverified')
  })

  // The tolerant schema's visible half: a stage SahajCloud adds later parses, reaches
  // the panel, and simply carries no badge — it never throws to the error boundary.
  it('renders no badge for a stage the widget does not recognise', () => {
    expect(panel('some-future-stage')).not.toContain(TITLE_KEY)
    expect(panel(null)).not.toContain(TITLE_KEY)
  })

  // The other surface, from the same fixture the first assertion badges. Both keys,
  // not just the title: the card renders real chips here, so a badge landing in the
  // shared component would show up as either one.
  it('never marks the list card, for the same unverified listing', () => {
    const markup = card('unverified')

    expect(markup).not.toContain(TITLE_KEY)
    expect(markup).not.toContain(NOTE_KEY)
    expect(markup).not.toContain('unverified')
  })
})
