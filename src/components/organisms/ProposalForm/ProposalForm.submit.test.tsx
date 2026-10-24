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

import { ProposalForm } from './ProposalForm'

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

/** The view's part, reduced to state: the panel edits a draft its owner holds. */
function Harness({
  initial,
  correction,
  startAt = 'review',
}: {
  initial: ListingDraft
  correction?: { eventId: number; baseDraft: ListingDraft }
  startAt?: ListingStep
}) {
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState<ListingStep>(startAt)
  const [sent, setSent] = useState(false)

  return (
    <ProposalForm
      context={context}
      correction={correction}
      draft={draft}
      sent={sent}
      step={step}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onClose={() => {}}
      onSent={() => setSent(true)}
      onStep={setStep}
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
  const field = container.querySelector<HTMLInputElement>(selector)

  if (!field) throw new Error(`no ${selector}`)

  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

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

describe('ProposalForm submit', () => {
  it('sends a new listing as a proposal, then shows the receipt', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 7 } }) })

    const root = await mount({ initial: inPerson })

    await type('#submit-sender-email', 'ada@example.org')
    expect(container.textContent).not.toContain('submit.done.title')
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
    // The receipt names the city the visitor chose.
    expect(container.textContent).toContain('submit.done.title')
    expect(container.textContent).toContain('submit.done.body')

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
    expect(container.textContent).not.toContain('submit.done.title')

    await act(async () => root.unmount())
  })

  it('will not send an online class without a city, and returns to Where', async () => {
    const root = await mount({
      initial: { ...inPerson, eventType: 'online', onlineUrl: 'https://meet.example/a' },
    })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request).not.toHaveBeenCalled()
    expect(container.textContent).toContain('submit.where.title')
    expect(container.textContent).toContain('submit.errors.city_required')

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

  it('says so, and sends nothing, when a correction changes nothing', async () => {
    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson },
    })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request).not.toHaveBeenCalled()
    expect(container.textContent).toContain('submit.review.no_changes')

    await act(async () => root.unmount())
  })
})

/** Presses the button whose visible text is `label` — the copy keys, under the identity `t`. */
async function press(label: string) {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  )

  if (!button) throw new Error(`no ${label} button`)
  await act(async () => button.click())
}

describe('ProposalForm steps', () => {
  it('lets Contact and About be skipped on the way to review', async () => {
    const root = await mount({ initial: inPerson, startAt: 'contact' })

    expect(container.textContent).toContain('submit.contact.title')
    await press('submit.chrome.skip')
    expect(container.textContent).toContain('submit.about.title')
    await press('submit.chrome.skip')
    expect(container.querySelector('#submit-sender-email')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('holds Where until an address is picked', async () => {
    const root = await mount({ initial: { ...inPerson, address: null }, startAt: 'where' })

    await press('submit.chrome.next')
    expect(container.textContent).toContain('submit.errors.address_required')
    expect(container.textContent).not.toContain('submit.when.title')

    await act(async () => root.unmount())
  })

  it('offers title, languages and website under Add more details, then returns to review', async () => {
    const root = await mount({ initial: inPerson })

    await press('submit.review.add_more')
    expect(container.querySelector('#submit-title')).not.toBeNull()
    expect(container.textContent).toContain('submit.more.languages_label')
    expect(container.querySelector('#submit-website')).not.toBeNull()
    await press('submit.chrome.back')
    expect(container.querySelector('#submit-sender-email')).not.toBeNull()

    await act(async () => root.unmount())
  })
})
