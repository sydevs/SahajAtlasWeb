// @vitest-environment jsdom
//
// A DOM for the reason the submit spec has one: the property is a blur and a re-render — type a
// mistyped address, leave the box, read the box — which SSR markup cannot express.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistrationForm } from './RegistrationForm'

import { RegistrationRefusedError } from '@/config/api/mutate'
import { useRegistrationDraft } from '@/config/store'

vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    request = vi.fn()
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

// Every key renders as itself, so an assertion names the exact copy shown.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { on: () => {}, off: () => {}, resolvedLanguage: 'en' },
  }),
}))

const EVENT_ID = 77
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  useRegistrationDraft.getState().clearDraft()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function mount(initialRefusal?: RegistrationRefusedError) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <RegistrationForm
          eventId={EVENT_ID}
          eventTitle="Evening meditation"
          initialRefusal={initialRefusal}
          isOnline={false}
          questions={[]}
          recurrenceType="WEEKLY"
          upcomingDates={[new Date(Date.now() + WEEK_MS), new Date(Date.now() + 2 * WEEK_MS)]}
        />
      </QueryClientProvider>,
    )
  })
}

const email = () => container.querySelector<HTMLInputElement>('#email')!

async function typeAndLeave(value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  await act(async () => {
    setValue?.call(email(), value)
    email().dispatchEvent(new Event('input', { bubbles: true }))
    // React's onBlur listens for focusout.
    email().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  })
}

describe('a mistyped email', () => {
  it('clears as soon as an edit makes it valid', async () => {
    await mount()
    await typeAndLeave('anna@gmail')

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

    await act(async () => {
      setValue?.call(email(), 'anna@gmail.com')
      email().dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.querySelector('#email-error')).toBeNull()
  })

  it('is flagged on its own box as soon as the visitor leaves it', async () => {
    await mount()
    await typeAndLeave('anna@gmail')

    expect(container.querySelector('#email-error')?.textContent).toBe('registration.errors.email')
    expect(email().getAttribute('aria-invalid')).toBe('true')
    expect(email().getAttribute('aria-describedby')).toBe('email-error')
    // The browser's own bubble never gets a say.
    expect(container.querySelector('form')?.noValidate).toBe(true)
  })

  // Only an edit clears SahajCloud's refusal: the schema would pass this address.
  it('keeps a refusal on its box when the visitor leaves it unedited', async () => {
    useRegistrationDraft.getState().setDraft(EVENT_ID, { email: 'anna@mailinator.com' })

    await mount(new RegistrationRefusedError('disposable_email', '', 'senderEmail'))
    await act(async () => {
      email().dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(container.querySelector('#email-error')?.textContent).toBe(
      'common.report_errors.disposable_email',
    )
  })

  it('waits for Register when the box is left empty', async () => {
    await mount()
    await typeAndLeave('')

    expect(container.querySelector('#email-error')).toBeNull()
    expect(email().getAttribute('aria-invalid')).toBeNull()
  })

  // The drawer remounts its content when it crosses between sheet and side panel.
  it('comes back flagged when a remount restores it', async () => {
    useRegistrationDraft.getState().setDraft(EVENT_ID, { email: 'anna@gmail' })

    await mount()

    expect(email().value).toBe('anna@gmail')
    expect(container.querySelector('#email-error')?.textContent).toBe('registration.errors.email')
  })
})

describe('the first-class date', () => {
  it('opens on the next date, named by how far off it is', async () => {
    await mount()

    const trigger = container.querySelector('#startingAt')

    expect(trigger?.getAttribute('role')).toBe('combobox')
    expect(trigger?.textContent).toContain('Next week')
  })
})
