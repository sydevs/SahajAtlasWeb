import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ListingDetails } from './ListingDetails'

import { mockEvent } from '@/mocks/events'

// The add-a-class listing (#147) renders through the published panel. These pin what it
// changes: nothing a visitor can act on, and on review an Edit link per section. Register and
// the action row render markers so their ABSENCE means something.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'en', languageCode: 'en', languageLabel: (code: string) => code }),
}))
vi.mock('@/hooks/use-ip-location', () => ({ useIpLocation: () => null }))
vi.mock('@/components/organisms/EventDetails/EventRegister', () => ({
  EventRegisterBar: () => <i>register-slot</i>,
}))
vi.mock('@/components/molecules/EventActions', () => ({
  EventActions: () => <i>actions-slot</i>,
}))
vi.mock('@/components/organisms/EventDetails/sanitize', () => ({
  sanitizeDescription: (html: string) => html,
}))

const EDIT = 'submit.review.edit'

const render = (onEdit?: () => void) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ListingDetails
        listing={{ ...mockEvent, contactName: 'Ada', contactPhone: '+44 20 7946 0000' }}
        path="/add"
        onEdit={onEdit}
      />
    </MemoryRouter>,
  )

const editLinks = (markup: string) => markup.match(new RegExp(`>${EDIT}<`, 'g')) ?? []

describe('ListingDetails', () => {
  it('drops Register and the action row, and shows the contact as plain lines', () => {
    const markup = render()

    expect(markup).not.toContain('register-slot')
    expect(markup).not.toContain('actions-slot')
    expect(markup).toContain('Ada')
    expect(markup).toContain('+44 20 7946 0000')
  })

  it('puts an Edit link on each section on review, each naming the step it opens', () => {
    const markup = render(() => {})

    // Chips, When, Where, Contact and About — the three detail sections all return to Details.
    expect(editLinks(markup)).toHaveLength(5)
    for (const step of ['step_details', 'step_when', 'step_where']) {
      expect(markup).toContain(`aria-label="${EDIT}: submit.chrome.${step}"`)
    }
  })

  it('shows no Edit link before review', () => {
    expect(editLinks(render())).toHaveLength(0)
  })

  it('never offers a correction to the listing itself', () => {
    expect(render()).not.toContain('submit.chrome.correct_entry_ask')
  })
})
