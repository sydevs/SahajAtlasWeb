import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EventListItem } from './EventListItem'

import { EventDetails } from '@/components/organisms/EventDetails/EventDetails'
import { mockEvent, mockEventSlim } from '@/mocks/events'

// The card and the class page each pair EventFacts with EventChips over one resolve (#505). Both
// render for real here. `useEventDisplay` builds one `Intl.ListFormat` per resolve of a recurring
// class, so counting those counts resolves: a component that resolves for itself again shows up as
// a second one. (A spy on the hook itself is a second React under `importOriginal`.)
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-map-controller', () => ({
  useMapController: () => ({ highlightEvent: () => {} }),
}))
vi.mock('@/hooks/use-prefetch-event', () => ({
  useHoverPrefetch: () => ({ enter: () => {}, leave: () => {} }),
}))
vi.mock('@/components/organisms/EventDetails/EventRegister', () => ({
  EventRegisterBar: () => null,
}))
vi.mock('@/components/molecules/EventActions', () => ({ EventActions: () => null }))
// DOMPurify binds a real `window` at module scope; `sanitize.test.ts` owns that allowlist.
vi.mock('@/components/organisms/EventDetails/sanitize', () => ({
  sanitizeDescription: (html: string) => html,
}))

describe('one resolve per surface', () => {
  // `Intl`'s members are typed read-only; the runtime lets a spec swap one and put it back.
  const intl = Intl as { ListFormat: typeof Intl.ListFormat }
  const Original = intl.ListFormat
  let built = 0

  beforeEach(() => {
    built = 0
    intl.ListFormat = class extends Original {
      constructor(...args: ConstructorParameters<typeof Original>) {
        super(...args)
        built += 1
      }
    }
  })
  afterEach(() => {
    intl.ListFormat = Original
  })

  it('resolves a list card once, for its facts and its chips together', () => {
    renderToStaticMarkup(
      <MemoryRouter>
        <EventListItem event={mockEventSlim} />
      </MemoryRouter>,
    )

    expect(built).toBe(1)
  })

  it('resolves the class page body once', () => {
    renderToStaticMarkup(<EventDetails basePath="/gb/cambridge/1" event={mockEvent} />)

    expect(built).toBe(1)
  })
})
