// @vitest-environment jsdom
//
// This boots a DOM for the reason `ReportIssueForm.submit.test.tsx` does: what it covers is the
// screen AFTER an async submit resolves or is refused, and the request that submit produced.
// SSR markup can reach neither. The SDK is mocked at its boundary, so the real `sendProposal`
// body mapping and refusal re-cast run inside the system under test.
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ListingDraft, ListingStep } from '@/lib/proposal'

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SendForm } from './SendForm'

import { emptyDraft, featureToPlace } from '@/lib/proposal'

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
    i18n: { language: 'en', resolvedLanguage: 'en', on: () => {}, off: () => {} },
  }),
}))
// The geocoder is a custom element and the map a WebGL canvas; neither is under test here.
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

const addressFeature = {
  type: 'Feature',
  id: 'address.1',
  geometry: { type: 'Point', coordinates: [-0.1276, 51.5034] },
  properties: {
    mapbox_id: 'dXJuOm1ieGFkcjoxMjM0',
    feature_type: 'address',
    name: '10 Downing Street',
    full_address: '10 Downing Street, London',
    coordinates: { longitude: -0.1276, latitude: 51.5034 },
    context: {
      place: { mapbox_id: 'dXJuOm1ieHBsYzpBUVRC', name: 'London' },
      region: { mapbox_id: 'dXJuOm1ieHBsYzpBVFk=', name: 'England' },
      country: { mapbox_id: 'dXJuOm1ieHBsYzpJdTA', name: 'United Kingdom', country_code: 'gb' },
    },
  },
} as unknown as GeocodingFeature

const inPerson: ListingDraft = {
  ...emptyDraft('Europe/London', ['en']),
  address: featureToPlace(addressFeature),
  firstDate: '2030-11-05',
  startTime: '19:00',
}

const context = {
  path: '/add',
  pageUrl: 'https://host.example/classes',
  locale: 'en',
  userAgent: 'TestAgent/1.0',
}

let container: HTMLDivElement

beforeEach(() => {
  sdk.request.mockReset()
  window.turnstile = {
    render: (_el, options) => {
      options.callback?.('tok-live')

      return 'widget-1'
    },
    remove: () => {},
    reset: () => {},
  }
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

/** The view's part, reduced to state: the form sends a draft its owner holds. */
function Harness({
  initial,
  correction,
  onInvalid = () => {},
}: {
  initial: ListingDraft
  correction?: { eventId: number; baseDraft: ListingDraft }
  onInvalid?: (step: ListingStep) => void
}) {
  const [sent, setSent] = useState(false)
  const [sender, setSender] = useState({ email: '', note: '' })

  return sent ? (
    <p>sent</p>
  ) : (
    <SendForm
      context={context}
      correction={correction}
      draft={initial}
      sender={sender}
      onInvalid={onInvalid}
      onSender={(patch) => setSender((current) => ({ ...current, ...patch }))}
      onSent={() => setSent(true)}
    />
  )
}

async function mount(props: Parameters<typeof Harness>[0]) {
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient()}>
          <Harness {...props} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
  })

  return root
}

async function type(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)

  if (!field) throw new Error(`no ${selector}`)

  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setValue = Object.getOwnPropertyDescriptor(prototype, 'value')?.set

  await act(async () => {
    setValue?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit() {
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

const refuse = (code?: string) =>
  sdk.request.mockRejectedValue(
    Object.assign(new Error('Refused.'), {
      errors: [{ message: 'Refused.', ...(code ? { data: { code } } : {}) }],
      status: code ? 400 : 500,
    }),
  )

describe('SendForm', () => {
  it('sends a new listing as a proposal, with the place’s ids and no region', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 7 } }) })

    const root = await mount({ initial: inPerson })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request).toHaveBeenCalledTimes(1)

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.type).toBe('proposal')
    expect(json.senderEmail).toBe('ada@example.org')
    expect(json.proposed.address.mapboxId).toBe('dXJuOm1ieGFkcjoxMjM0')
    expect(json.location).toEqual({
      placeId: 'dXJuOm1ieHBsYzpBUVRC',
      regionId: 'dXJuOm1ieHBsYzpBVFk=',
      countryId: 'dXJuOm1ieHBsYzpJdTA',
    })
    expect(json).not.toHaveProperty('event')
    expect(json).not.toHaveProperty('regionHint')
    expect(json.proposed).not.toHaveProperty('region')
    expect(container.textContent).toContain('sent')

    await act(async () => root.unmount())
  })

  it.each([
    ['captcha_failed', 'submit.errors.captcha'],
    ['captcha_unavailable', 'submit.errors.send_failed'],
    ['invalid_email', 'submit.errors.email'],
    ['disposable_email', 'submit.errors.disposable_email'],
    ['urls_not_allowed', 'submit.errors.urls_not_allowed'],
    ['content_unscannable', 'submit.errors.send_failed'],
    [undefined, 'submit.errors.send_failed'],
  ])('renders the %s refusal as its own sentence, never a bare failure', async (code, key) => {
    refuse(code)

    const root = await mount({ initial: inPerson })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(key)
    expect(container.textContent).not.toContain('sent')

    await act(async () => root.unmount())
  })

  it('will not send an online class without a city, and sends the visitor back to Where', async () => {
    const invalid = vi.fn()
    const root = await mount({
      initial: { ...inPerson, eventType: 'online', onlineUrl: 'https://meet.example/a' },
      onInvalid: invalid,
    })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request).not.toHaveBeenCalled()
    expect(invalid).toHaveBeenCalledWith('where')

    await act(async () => root.unmount())
  })

  it('needs the submitter’s own address', async () => {
    const root = await mount({ initial: inPerson })

    await type('#submit-sender-email', 'not-an-address')
    await submit()

    expect(sdk.request).not.toHaveBeenCalled()
    expect(container.textContent).toContain('submit.errors.email')

    await act(async () => root.unmount())
  })

  it('sends a correction naming its event, with only what changed', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 8 } }) })

    const base = { ...inPerson, room: 'Hall A', contactPhone: '01865 000000' }
    const root = await mount({
      initial: { ...base, room: 'Hall B' },
      correction: { eventId: 507, baseDraft: base },
    })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.event).toBe(507)
    expect(json.proposed).toEqual({ address: { room: 'Hall B' } })
    expect(json).not.toHaveProperty('location')

    await act(async () => root.unmount())
  })

  it('sends a correction that is only a note — "it’s no longer running" has no field to change', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 10 } }) })

    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson },
    })

    await type('#submit-sender-email', 'ada@example.org')
    await type('#submit-note', 'This class is no longer running.')
    await submit()

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(sdk.request.mock.calls[0][0].json.event).toBe(507)

    await act(async () => root.unmount())
  })

  it('asks for a change or a note, and sends nothing, when a correction carries neither', async () => {
    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson },
    })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request).not.toHaveBeenCalled()
    expect(container.textContent).toContain('submit.review.note_needed')

    await act(async () => root.unmount())
  })

  it('says why it cannot send when the security check is blocked', async () => {
    // A refused widget — a sitekey this domain is not registered for — never yields a token.
    window.turnstile = {
      render: () => undefined,
      remove: () => {},
      reset: () => {},
    }

    const root = await mount({ initial: inPerson })

    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    expect(container.textContent).toContain('common.errors.captcha_blocked')

    await act(async () => root.unmount())
  })
})
