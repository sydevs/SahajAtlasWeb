// @vitest-environment jsdom
//
// This boots a DOM for the reason `ReportIssueForm.submit.test.tsx` does: what it covers is the
// screen AFTER a tap or an async send, and the request that send produced. SSR markup reaches
// neither. The SDK is mocked at its boundary, so the real `sendProposal` body mapping runs.
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ListingDraft } from '@/lib/proposal'
import type { CorrectionReason, Question } from '@/lib/questions'

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ListingQuestions } from './ListingQuestions'

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
let asked: Question[] = []

beforeEach(() => {
  sdk.request.mockReset()
  asked = []
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

/** The view's part, reduced to state: the flow edits a draft its owner holds. */
function Harness({
  initial,
  correction,
  startAt,
  note = '',
}: {
  initial: ListingDraft
  correction?: { eventId: number; baseDraft: ListingDraft; title: string }
  startAt: Question
  note?: string
}) {
  const [draft, setDraft] = useState(initial)
  const [question, setQuestion] = useState<Question>(startAt)
  const [reason, setReason] = useState<CorrectionReason | null>(null)
  const [answered, setAnswered] = useState<Question[]>([])
  const [sent, setSent] = useState(false)
  const [sender, setSender] = useState({ email: '', note })

  return (
    <ListingQuestions
      answered={answered}
      context={context}
      correction={correction}
      draft={draft}
      question={question}
      reason={reason}
      review={<p>the listing</p>}
      reviewed={false}
      sender={sender}
      sent={sent}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onClose={() => {}}
      onQuestion={(next, forward = true) => {
        asked.push(next)
        if (forward) setAnswered((current) => [...current, question])
        setQuestion(next)
      }}
      onReason={setReason}
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

async function press(label: string) {
  const button = [...document.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  )

  if (!button) throw new Error(`no button ${label}`)
  await act(async () => {
    button.click()
    // A tapped answer moves on after a short beat.
    await new Promise((resolve) => setTimeout(resolve, 450))
  })
}

const sentBody = () => sdk.request.mock.calls[0][0].json

describe('ListingQuestions', () => {
  it('sends a new listing as a proposal, then says what happens next', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 7 } }) })

    const root = await mount({ initial: inPerson, startAt: 'review' })

    await type('#send-email', 'ada@example.org')
    await submit()

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(sentBody().type).toBe('proposal')
    expect(sentBody().senderEmail).toBe('ada@example.org')
    expect(sentBody().proposed.address.mapboxId).toBe('dXJuOm1ieGFkcjoxMjM0')
    expect(sentBody()).not.toHaveProperty('event')
    expect(container.textContent).toContain('submit.ask.sent_title')
    expect(container.textContent).toContain('submit.ask.next_check')

    await act(async () => root.unmount())
  })

  it('refuses a refused send in a sentence, never a bare failure', async () => {
    sdk.request.mockRejectedValue(
      Object.assign(new Error('Refused.'), {
        errors: [{ message: 'Refused.', data: { code: 'disposable_email' } }],
        status: 400,
      }),
    )

    const root = await mount({ initial: inPerson, startAt: 'review' })

    await type('#send-email', 'ada@example.org')
    await submit()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'submit.errors.disposable_email',
    )
    expect(container.textContent).not.toContain('submit.ask.sent_title')

    await act(async () => root.unmount())
  })

  it('sends "it has stopped" with nothing else changed, saying so in the note', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 7 } }) })

    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson, title: 'Tuesdays' },
      startAt: 'changed',
    })

    await press('submit.correct.reason_stopped')
    expect(asked.at(-1)).toBe('stopped')
    await press('submit.ask.continue')
    expect(asked.at(-1)).toBe('review')

    await type('#send-email', 'ada@example.org')
    await submit()

    expect(sentBody().event).toBe(507)
    expect(sentBody().proposed).toEqual({})
    expect(JSON.stringify(sentBody().submissionData)).toContain('submit.correct.stopped_marker')

    await act(async () => root.unmount())
  })

  it('keeps "it has stopped" when a second correction is added after it', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 7 } }) })

    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson, title: 'Tuesdays' },
      startAt: 'changed',
    })

    await press('submit.correct.reason_stopped')
    await press('submit.ask.continue')
    await press('submit.correct.another')
    await press('submit.correct.reason_contact')
    await type('#ask-contact-phone', '+44 7700 900123')
    await press('submit.ask.continue')
    expect(asked.at(-1)).toBe('review')

    await type('#send-email', 'ada@example.org')
    await submit()

    expect(sentBody().proposed).toEqual({ contactPhone: '+44 7700 900123' })
    expect(JSON.stringify(sentBody().submissionData)).toContain('submit.correct.stopped_marker')

    await act(async () => root.unmount())
  })

  it('sends nothing for a correction that changes nothing and says nothing', async () => {
    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson, title: 'Tuesdays' },
      startAt: 'review',
    })

    await type('#send-email', 'ada@example.org')
    await submit()

    expect(sdk.request).not.toHaveBeenCalled()
    expect(container.textContent).toContain('submit.review.no_changes')

    await act(async () => root.unmount())
  })

  it('asks a "time changed" correction only the schedule questions', async () => {
    const root = await mount({
      initial: inPerson,
      correction: { eventId: 507, baseDraft: inPerson, title: 'Tuesdays' },
      startAt: 'changed',
    })

    await press('submit.correct.reason_time')

    expect(asked).toEqual(['often'])

    await act(async () => root.unmount())
  })

  it('holds the place question until a place is picked', async () => {
    const root = await mount({ initial: emptyDraft('Europe/London', ['en']), startAt: 'place' })

    await press('submit.ask.continue')

    expect(asked).toEqual([])
    expect(container.textContent).toContain('submit.errors.address_required')

    await act(async () => root.unmount())
  })

  it('moves on as soon as a choice is tapped', async () => {
    const root = await mount({ initial: emptyDraft('Europe/London', ['en']), startAt: 'mode' })

    await press('submit.where.online')

    expect(asked).toEqual(['link'])

    await act(async () => root.unmount())
  })
})
