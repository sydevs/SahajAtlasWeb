// @vitest-environment jsdom
//
// This opts into a DOM for the reason `ReportIssueForm.submit.test.tsx` does: the property is a
// re-render plus an async submit — tick the box, press Register, read the request — which SSR
// markup cannot express. The SSR sibling covers whether the box renders at all.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistrationForm } from './RegistrationForm'

// Mocked at the SDK boundary, so the real `createRegistration` body mapping runs.
const sdk = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), request: vi.fn() }))

vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = sdk.find
    findByID = sdk.findByID
    request = sdk.request
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { on: () => {}, off: () => {}, resolvedLanguage: 'en' },
  }),
}))

let container: HTMLDivElement

beforeEach(() => {
  sdk.request.mockReset()
  sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 7 } }) })
  // Stands in for the Turnstile script, so the real `useTurnstile` solves through its own
  // callback and enables Register.
  window.turnstile = {
    render: (_el, options) => {
      options.callback?.('tok-live')

      return 'widget-1'
    },
    remove: () => {},
    reset: () => {},
  }
  // Radix's checkbox measures its hidden form input, and jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  delete window.turnstile
  vi.unstubAllGlobals()
})

async function type(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)

  if (!field) throw new Error(`no ${selector}`)

  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

  await act(async () => {
    setValue?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function registerWith({ tick }: { tick: boolean }) {
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <RegistrationForm
          offersMailingList
          eventId={4242}
          eventTitle="Evening meditation"
          isOnline={false}
          questions={[]}
          upcomingDates={[new Date('2030-10-01T18:00:00Z')]}
        />
      </QueryClientProvider>,
    )
  })

  await type('#name', 'Ada Lovelace')
  await type('#email', 'ada@example.org')

  if (tick) {
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="checkbox"]')?.click()
    })
  }

  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })

  return root
}

const subscribePair = () =>
  (sdk.request.mock.calls[0]?.[0].json.submissionData as { field: string; value: string }[]).find(
    (entry) => entry.field === 'subscribe',
  )

describe('RegistrationForm mailing-list opt-in', () => {
  it('sends `subscribe: yes` when the box is ticked', async () => {
    const root = await registerWith({ tick: true })

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(subscribePair()).toEqual({ field: 'subscribe', value: 'yes' })

    await act(async () => root.unmount())
  })

  it('sends no opt-in when the box is left alone', async () => {
    const root = await registerWith({ tick: false })

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(subscribePair()).toBeUndefined()

    await act(async () => root.unmount())
  })
})
