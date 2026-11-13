import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, it, expect, vi } from 'vitest'

import { RegistrationView } from './RegistrationView'

import { mockEvent } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). The registration route is
// deep-linkable, so a registrant can reach the form without ever passing the event
// panel that carries the same caveat. That is the property under test, and the event
// panel's own spec cannot see it.
//
// The surrounding chrome is stubbed with MARKERS, not nulls: the caveat's position
// below the form is half of what is asserted, and a null stub leaves nothing to order
// against.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/molecules', () => ({
  EventSummary: () => <i>summary-card</i>,
  FallbackPanel: () => <i>blocked-panel</i>,
}))
vi.mock('@/components/organisms/RegistrationForm', () => ({
  RegistrationForm: ({ initialSubmitted }: { initialSubmitted?: boolean }) => (
    <i>{initialSubmitted ? 'registration-confirmation' : 'registration-form'}</i>
  ),
}))
vi.mock('@/components/organisms/EventDetails/EventRegister', () => ({
  EventRegisterBar: () => <i>external-cta</i>,
}))
vi.mock('@/hooks/use-share-url', () => ({
  useShareUrl: () => 'https://example.org/event',
}))

const { displayMock } = vi.hoisted(() => ({
  displayMock: { registration: 'open' as string, kind: 'oneoff' as string, next: null },
}))

vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({
    display: displayMock,
    blockedMessage: displayMock.registration === 'open' ? null : 'registration closed',
    whereLine: 'London',
  }),
  useListingTitle: (event: { title: string }) => event.title,
}))

const { eventMock } = vi.hoisted(() => ({ eventMock: { current: null as unknown } }))

vi.mock('@/views/nav', () => ({ NavHeader: ({ title }: { title: string }) => <h2>{title}</h2> }))

vi.mock('@/views/shared', () => ({
  useDrawerControl: () => ({ dismiss: () => {} }),
  useEventFromPath: () => ({ data: eventMock.current }),
  useFrameEventOnTop: () => {},
}))

const TITLE_KEY = 'event.display.unverified_title'
const NOTE_KEY = 'event.display.unverified_note'

const view = (verificationStage: string | null, registration = 'open', search = '') => {
  eventMock.current = { ...mockEvent, verificationStage }
  displayMock.registration = registration

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`${mockEvent.path}/register${search}`]}>
      <RegistrationView eventPath={mockEvent.path} parentPath="/gb/london" />
    </MemoryRouter>,
  )
}

describe('unverified caveat on the registration screen', () => {
  it('renders below the registration form', () => {
    const markup = view('unverified')

    expect(markup).toContain(TITLE_KEY)
    expect(markup).toContain(NOTE_KEY)
    expect(markup).toContain('registration-form')
    expect(markup.indexOf(TITLE_KEY)).toBeGreaterThan(markup.indexOf('registration-form'))
  })

  it.each(['verified', 'some-future-stage', null])('renders nothing for %s', (stage) => {
    expect(view(stage)).not.toContain('unverified')
  })

  // The caveat sits outside the open/external/blocked branch. A listing nobody vouched
  // for is unverified whether or not it is still taking registrations, and the closed
  // screen still carries the organiser's phone number to press.
  it('renders on the blocked screen too', () => {
    const markup = view('unverified', 'closed')

    expect(markup).toContain('blocked-panel')
    expect(markup).toContain(TITLE_KEY)
  })
})

// PROTOTYPE, review only (`config/review-options.ts`): the review blocks every submission, so a
// link opens the confirmation instead. It is read from the route's own query, never the host
// page's address, where a host's own `?registered=1` would have made registering impossible.
describe('the review’s ?registered=1', () => {
  it('opens the route on the confirmation when its own query asks', () => {
    const markup = view(null, 'open', '?registered=1')

    expect(markup).toContain('registration.form.confirmed_title')
    expect(markup).toContain('registration-confirmation')
  })

  it('opens on the form otherwise', () => {
    expect(view(null)).toContain('registration.form.title_class')
    expect(view(null, 'open', '?registered=0')).toContain('registration-form')
  })
})
