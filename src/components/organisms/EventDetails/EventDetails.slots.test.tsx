import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { type EventDetailsProps, EventDetails } from './EventDetails'

import { mockEvent } from '@/mocks/events'

// The panel's two composition points. Register and the action row render markers so their
// ABSENCE means something.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-ip-location', () => ({ useIpLocation: () => null }))
vi.mock('./EventRegister', () => ({ EventRegisterBar: () => <i>register-slot</i> }))
vi.mock('@/components/molecules/EventActions', () => ({
  EventActions: () => <i>actions-slot</i>,
}))
vi.mock('./sanitize', () => ({ sanitizeDescription: (html: string) => html }))

const render = (props: Partial<EventDetailsProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <EventDetails basePath="/gb/oxford/507" event={mockEvent} {...props} />
    </MemoryRouter>,
  )

describe('EventDetails slots', () => {
  it('leaves a published class with its caveat, Register and action row', () => {
    const markup = render()

    expect(markup).toContain('register-slot')
    expect(markup).toContain('actions-slot')
  })

  it('renders `actions` in place of Register and the action row', () => {
    const markup = render({ actions: <i>own-actions</i> })

    expect(markup).toContain('own-actions')
    expect(markup).not.toContain('register-slot')
    expect(markup).not.toContain('actions-slot')
  })

  it('puts the trailing content at the end of every section', () => {
    const markup = render({ sectionTrailing: (section) => <b>{`end-${section}`}</b> })

    for (const section of ['details', 'when', 'where', 'about']) {
      expect(markup).toContain(`end-${section}`)
    }
  })

  it('shows an empty About only to a caller that composes the sections', () => {
    const empty = { ...mockEvent, description: null }

    expect(render({ event: empty })).not.toContain('event.display.about')
    expect(render({ event: empty, sectionTrailing: () => null })).toContain('event.display.about')
  })
})
