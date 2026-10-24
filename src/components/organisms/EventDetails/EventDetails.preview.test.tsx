import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EventDetails } from './EventDetails'

import { mockEvent } from '@/mocks/events'

// The add-a-class listing (#147) renders through the same panel as a published class. These
// pin what the preview mode changes: nothing a visitor can act on, and on review an Edit link
// per section. Register and the action row render markers so their ABSENCE means something.
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

const EDIT = 'submit.review.edit'

const render = (preview?: Parameters<typeof EventDetails>[0]['preview']) =>
  renderToStaticMarkup(
    <EventDetails
      basePath="/add"
      event={{ ...mockEvent, contactName: 'Ada', contactPhone: '+44 20 7946 0000' }}
      preview={preview}
    />,
  )

const editLinks = (markup: string) => markup.match(new RegExp(`>${EDIT}<`, 'g')) ?? []

describe('EventDetails preview', () => {
  it('drops Register and the action row, and shows the contact as plain lines', () => {
    const markup = render({})

    expect(markup).not.toContain('register-slot')
    expect(markup).not.toContain('actions-slot')
    expect(markup).toContain('Ada')
    expect(markup).toContain('+44 20 7946 0000')
  })

  it('puts an Edit link on each section on review, each naming its section', () => {
    const markup = render({ onEdit: () => {} })

    // Details, When, Where, Contact and About.
    expect(editLinks(markup)).toHaveLength(5)
    for (const section of [
      'submit.more.title',
      'submit.when.title',
      'submit.where.title',
      'submit.contact.title',
      'event.display.about',
    ]) {
      expect(markup).toContain(`aria-label="${EDIT}: ${section}"`)
    }
  })

  it('shows no Edit link before review', () => {
    expect(editLinks(render({}))).toHaveLength(0)
  })

  it('leaves a published class exactly as it was', () => {
    const markup = render(undefined)

    expect(markup).toContain('register-slot')
    expect(markup).toContain('actions-slot')
    expect(editLinks(markup)).toHaveLength(0)
  })
})
