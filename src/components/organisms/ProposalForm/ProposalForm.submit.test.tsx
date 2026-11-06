// @vitest-environment jsdom
//
// This boots a DOM for the reason `ReportIssueForm.submit.test.tsx` does: what it covers is the
// screen AFTER an async submit resolves or is refused, and the request that submit produced.
// SSR markup can reach neither. The SDK is mocked at its boundary, so the real `sendProposal`
// body mapping and refusal re-cast run inside the system under test.
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { FixIntent, ListingDraft, ListingStep } from '@/lib/proposal'

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProposalForm } from './ProposalForm'

import { draftPreviewSchedule, emptyDraft, featureToPlace, previewEvent } from '@/lib/proposal'
import { challengeFrameStub } from '@/test-support/turnstile-frame'

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
  vi.unstubAllGlobals()
})

/** The view's part, reduced to state: the panel edits a draft its owner holds. */
function Harness({
  initial,
  correction,
  startAt = 'review',
  startIntent = null,
  reviewed,
  withListing = false,
}: {
  reviewed?: boolean
  /** Hands the form the listing it previews, and a correction its published class — so Check
   *  renders the change list a correction's Undo lives on. */
  withListing?: boolean
  initial: ListingDraft
  correction?: { eventId: number; baseDraft: ListingDraft }
  startAt?: ListingStep
  startIntent?: FixIntent | null
}) {
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState<ListingStep>(startAt)
  const [intent, setIntent] = useState<FixIntent | null>(startIntent)
  const [reported, setReported] = useState(startIntent === 'stopped')
  const [nobodyOn, setNobodyOn] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [sender, setSender] = useState({ email: '', note: '' })

  return (
    <ProposalForm
      context={context}
      correction={
        correction && withListing
          ? { ...correction, event: { ...asListing(correction.baseDraft), id: correction.eventId } }
          : correction
      }
      draft={draft}
      intent={intent}
      listing={withListing ? asListing(draft) : undefined}
      nobodyOn={nobodyOn}
      reported={reported}
      reviewed={reviewed}
      sender={sender}
      sent={sent}
      step={step}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onClearReport={() => setReported(false)}
      onClose={() => {}}
      onIntent={(picked, at) => {
        setIntent(picked)
        setReported((was) => was || picked === 'stopped')
        if (picked === 'nobody') setNobodyOn((was) => was ?? '')
        setStep(at)
      }}
      onNobodyOn={setNobodyOn}
      onSender={(patch) => setSender((current) => ({ ...current, ...patch }))}
      onSent={() => setSent(true)}
      onStep={setStep}
    />
  )
}

const asListing = (draft: ListingDraft) =>
  previewEvent(draft, { path: '/gb/london/507', schedule: draftPreviewSchedule(draft) })

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
  // The challenge frame mounts with Check, so the stub attaches at the moment it is needed.
  if (container.querySelector('iframe')) {
    const challenge = challengeFrameStub(container)

    await act(async () => challenge.solve())
  }

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
    expect(container.textContent).not.toContain('submit.done.heading')
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
    // The receipt says who checks it, in the city the visitor chose, and where we'll write.
    expect(container.textContent).toContain('submit.done.heading')
    expect(container.textContent).toContain('submit.done.body_check')
    expect(container.textContent).toContain('submit.done.email_line')

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
    expect(container.textContent).not.toContain('submit.done.heading')

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

  it('sends a correction that only moves an online class to a new city', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 9 } }) })

    const online: ListingDraft = {
      ...inPerson,
      eventType: 'online',
      address: null,
      city: { label: 'Oxford', city: 'Oxford', location: {} },
    }
    const root = await mount({
      initial: { ...online, city: featureToPlace(addressFeature) },
      correction: { eventId: 507, baseDraft: online },
    })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(container.textContent).not.toContain('submit.review.no_changes')
    expect(sdk.request.mock.calls[0][0].json.location.placeId).toBe('dXJuOm1ieHBsYzpBUVRC')

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
  it('ends a session the chosen length after it starts', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 14 } }) })

    const root = await mount({ initial: inPerson, startAt: 'when', reviewed: true })

    await press('submit.when.duration_90')
    await press('submit.chrome.done_editing')
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request.mock.calls[0][0].json.proposed.schedule.endTime).toBe('20:30')

    await act(async () => root.unmount())
  })

  it('holds Place until an address is picked', async () => {
    const root = await mount({ initial: { ...inPerson, address: null }, startAt: 'where' })

    await press('submit.chrome.continue')
    expect(container.textContent).toContain('submit.errors.address_required')
    expect(container.textContent).not.toContain('submit.when.title')

    await act(async () => root.unmount())
  })

  it('walks a new listing on through Time, Details and Check the first time', async () => {
    const root = await mount({ initial: inPerson, startAt: 'when' })

    await press('submit.chrome.continue')
    expect(container.textContent).toContain('submit.details.title')
    // Details are all optional: Continue goes straight on.
    await press('submit.chrome.continue')
    expect(container.querySelector('#submit-sender-email')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('holds Details while the website is not a web address', async () => {
    const root = await mount({
      initial: { ...inPerson, website: 'oxford.example' },
      startAt: 'details',
    })

    await press('submit.chrome.continue')
    expect(container.textContent).toContain('submit.errors.online_url')
    expect(container.querySelector('#submit-website')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('holds Time, on Back as on Continue, once "it ends on a set date" is on with no date', async () => {
    const root = await mount({ initial: inPerson, startAt: 'when' })

    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await press('submit.chrome.back')
    expect(container.textContent).toContain('submit.errors.last_date')
    expect(container.textContent).toContain('submit.when.title')

    await act(async () => root.unmount())
  })

  it('returns a step straight to Check once Check has been seen', async () => {
    const root = await mount({ initial: inPerson, startAt: 'when', reviewed: true })

    await press('submit.chrome.done_editing')
    expect(container.querySelector('#submit-sender-email')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('keeps the submitter’s address across an Edit round trip', async () => {
    const root = await mount({ initial: inPerson })

    await type('#submit-sender-email', 'ada@example.org')
    await press('submit.chrome.back')
    await press('submit.chrome.done_editing')
    expect(container.querySelector<HTMLInputElement>('#submit-sender-email')?.value).toBe(
      'ada@example.org',
    )

    await act(async () => root.unmount())
  })
})

describe('a place typed in by hand', () => {
  it('reaches the coordinator in the note, since no Events field carries it', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 12 } }) })

    const typed: ListingDraft = {
      ...inPerson,
      eventType: 'online',
      onlineUrl: 'https://meet.example/a',
      address: null,
      city: {
        label: 'Évora, Portugal',
        city: 'Évora',
        countryName: 'Portugal',
        location: {},
        manual: true,
      },
    }
    const root = await mount({ initial: typed })

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request.mock.calls[0][0].json.submissionData).toContainEqual({
      field: 'note',
      value: 'submit.note.manual_place',
    })

    await act(async () => root.unmount())
  })
})

describe('ProposalForm corrections', () => {
  const correction = { eventId: 507, baseDraft: inPerson }

  it('asks what needs fixing first, and opens only the step that fixes it', async () => {
    const root = await mount({ initial: inPerson, correction, startAt: 'fix' })

    expect(container.textContent).toContain('submit.fix.title')
    await press('submit.fix.when')
    expect(container.textContent).toContain('submit.when.title')
    await press('submit.chrome.continue')
    // Its Check lists what changes, not the whole listing.
    expect(container.textContent).toContain('submit.changes.title')

    await act(async () => root.unmount())
  })

  it('sends "nobody was there" with no field changed, and a default note', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 10 } }) })

    const root = await mount({ initial: inPerson, correction, startAt: 'fix' })

    await press('submit.fix.nobody')
    await press('submit.chrome.continue')
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.proposed).toEqual({})
    expect(json.submissionData).toContainEqual({
      field: 'note',
      value: 'submit.note.nobody_default',
    })

    await act(async () => root.unmount())
  })

  it('sends "it has stopped running" with no field changed, and a default note', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 10 } }) })

    const root = await mount({ initial: inPerson, correction, startAt: 'fix' })

    await press('submit.fix.stopped')
    await press('submit.chrome.continue')
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.event).toBe(507)
    expect(json.proposed).toEqual({})
    expect(json.submissionData).toContainEqual({
      field: 'note',
      value: 'submit.note.stopped_default',
    })
    expect(container.textContent).toContain('submit.done.body_correct')

    await act(async () => root.unmount())
  })

  it('keeps "it has stopped running" in the note when the visitor adds their own words', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 11 } }) })

    const root = await mount({ initial: inPerson, correction, startAt: 'fix' })

    await press('submit.fix.stopped')
    await act(async () => {
      const note = container.querySelector<HTMLTextAreaElement>('#submit-note')!
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

      setValue?.call(note, 'Ask Elizabeth.')
      note.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await press('submit.chrome.continue')
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    expect(sdk.request.mock.calls[0][0].json.submissionData).toContainEqual({
      field: 'note',
      value: 'submit.note.stopped_default\n\nAsk Elizabeth.',
    })

    await act(async () => root.unmount())
  })

  it('takes back one change and keeps the other, in one report', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 12 } }) })

    const root = await mount({ initial: inPerson, correction, startAt: 'fix', withListing: true })

    await press('submit.fix.details')
    await type('#submit-contact-phone', '+44 7700 900123')
    await press('submit.chrome.continue')
    await press('submit.changes.more')
    expect(container.textContent).toContain('submit.fix.title')
    await press('submit.fix.when')
    await type('#submit-start-time', '20:00')
    await press('submit.chrome.done_editing')
    expect(container.textContent).toContain('submit.changes.was')

    const undoContact = container.querySelector<HTMLButtonElement>(
      'button[aria-label="submit.changes.undo: submit.summary.contact"]',
    )

    await act(async () => undoContact?.click())
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.proposed.schedule).toBeDefined()
    expect(json.proposed).not.toHaveProperty('contactPhone')

    await act(async () => root.unmount())
  })

  it('goes back to "what needs fixing?" once every change is taken back', async () => {
    const root = await mount({ initial: inPerson, correction, startAt: 'fix', withListing: true })

    await press('submit.fix.details')
    await type('#submit-contact-phone', '+44 7700 900123')
    await press('submit.chrome.continue')
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label^="submit.changes.undo"]')
        ?.click(),
    )
    expect(container.textContent).toContain('submit.fix.title')

    await act(async () => root.unmount())
  })

  it('sends a known last class as the schedule end, and "not sure" as none', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 13 } }) })

    const root = await mount({ initial: inPerson, correction, startAt: 'fix' })

    await press('submit.fix.stopped')
    expect(container.textContent).toContain('submit.note.last_unsure')
    await press('submit.note.last_known')
    await type('#submit-stopped-last', '2030-12-03')
    await press('submit.chrome.continue')
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.proposed.schedule).toMatchObject({ endingType: 'until' })
    expect(json.submissionData).toContainEqual({
      field: 'note',
      value: 'submit.note.stopped_default',
    })

    await act(async () => root.unmount())
  })

  it('needs a few words for "something else" before it goes on', async () => {
    const root = await mount({ initial: inPerson, correction, startAt: 'fix' })

    await press('submit.fix.other')
    await press('submit.chrome.continue')
    expect(container.textContent).toContain('submit.note.other_required')

    await act(async () => root.unmount())
  })

  it('keeps a running class’s start when its day changes, shown and undone as one', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 15 } }) })

    // Every Wednesday since December 2022.
    const running = { ...inPerson, firstDate: '2022-12-21' }
    const root = await mount({
      initial: running,
      correction: { eventId: 717, baseDraft: running },
      startAt: 'fix',
      withListing: true,
    })

    await press('submit.fix.when')
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="Thursday"]')?.click(),
    )
    await type('#submit-start-time', '19:30')
    await press('submit.chrome.continue')

    // The new day and the first date it moves are one change, so one Undo.
    expect(container.querySelectorAll('button[aria-label^="submit.changes.undo"]')).toHaveLength(1)
    expect(container.textContent).toMatch(/submit\.when\.first_class: Thursday, December 22, 2022/)

    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.proposed.schedule).toMatchObject({
      firstDate: '2022-12-22T19:30:00.000Z',
      weekdays: ['TH'],
    })

    await act(async () => root.unmount())
  })
})

describe('ProposalForm details the walk cannot see', () => {
  it('finds the email field from inside a shadow root, as an embed renders it', async () => {
    const scroll = vi.fn()

    Element.prototype.scrollIntoView = scroll

    const host = document.createElement('div')

    container.appendChild(host)

    const shadow = host.attachShadow({ mode: 'open' })
    const mountPoint = shadow.appendChild(document.createElement('div'))
    const root = createRoot(mountPoint)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={new QueryClient()}>
            <Harness initial={inPerson} />
          </QueryClientProvider>
        </MemoryRouter>,
      )
    })
    await act(async () => {
      shadow
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(scroll).toHaveBeenCalled()
    expect(shadow.activeElement?.id).toBe('submit-sender-email')

    await act(async () => root.unmount())
  })

  it('shows an online class in the zone it was typed in, not the viewer’s', async () => {
    const root = await mount({
      initial: {
        ...inPerson,
        eventType: 'online',
        onlineUrl: 'https://meet.example/a',
        startTime: '19:30',
        endTime: '20:30',
        timeZone: 'Pacific/Auckland',
      },
      withListing: true,
    })

    // The whole range: a viewer's own zone can land on the same digits, half a day out.
    expect(container.textContent).toMatch(/7:30\s*–\s*8:30\sPM/)

    await act(async () => root.unmount())
  })

  it('takes a monthly rule back with the rest of the schedule', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ doc: { id: 12 } }) })

    const base = { ...inPerson, repeats: 'monthly' as const, firstDate: '2030-10-29' }
    const root = await mount({
      initial: base,
      correction: { eventId: 7, baseDraft: base },
      startAt: 'fix',
      withListing: true,
    })

    await press('submit.fix.when')
    await press('event.recurrence.monthly_last')
    await press('submit.chrome.continue')
    await press('submit.changes.more')
    await press('submit.fix.details')
    await type('#submit-contact-phone', '+44 7700 900123')
    await press('submit.chrome.done_editing')

    const undoWhen = [
      ...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="submit.changes.undo"]'),
    ].find((button) => /when|schedule/i.test(button.getAttribute('aria-label') ?? ''))

    await act(async () => undoWhen?.click())
    await type('#submit-sender-email', 'ada@example.org')
    await submit()

    const { json } = sdk.request.mock.calls[0][0]

    expect(json.proposed).toHaveProperty('contactPhone')
    expect(json.proposed).not.toHaveProperty('schedule')

    await act(async () => root.unmount())
  })

  it('keeps the last date through a detour to "just once"', async () => {
    const root = await mount({
      initial: { ...inPerson, endDate: '2031-06-01' },
      startAt: 'when',
    })

    await press('submit.when.once')
    await press('submit.when.weekly')

    expect(container.querySelector<HTMLInputElement>('#submit-end-date')?.value).toBe('2031-06-01')

    await act(async () => root.unmount())
  })
})
