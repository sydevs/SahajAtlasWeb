// @vitest-environment jsdom
//
// A refusal reaches the screen only after an async submit rejects, which SSR
// markup cannot express — the same reason `ReportIssueForm.submit.test.tsx`
// boots a DOM. This mocks at the SDK boundary, so the real `createRegistration`
// and its refusal re-cast stay inside the system under test.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
  onlineManager,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistrationForm } from './RegistrationForm'

import { queryClient } from '@/config/query-client'
import { challengeFrameStub, sendFromFrame } from '@/test-support/turnstile-frame'

const sdk = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), request: vi.fn() }))

vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = sdk.find
    findByID = sdk.findByID
    request = sdk.request
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

// ⚠ React Query publishes a settled mutation from a 0ms timer, which async `act` sometimes runs
// and sometimes does not (`docs/testing.md`, the Radix focus-restore race), so a read of the
// failure screen passed at random. A microtask lands inside the submit's `act` every time.
notifyManager.setScheduler(queueMicrotask)

let container: HTMLDivElement
// The challenge page, not our hook: the real `useTurnstile` frames that page and takes its
// token over `postMessage`, which is what enables Submit. See `challengeFrameStub`.
let challenge: ReturnType<typeof challengeFrameStub>

beforeEach(() => {
  sdk.request.mockReset()

  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

async function mountForm(
  client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } }),
) {
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RegistrationForm
          eventId={42}
          eventTitle="Evening meditation"
          isOnline={false}
          questions={['questions']}
          upcomingDates={[new Date('2026-12-01T18:00:00Z')]}
        />
      </QueryClientProvider>,
    )
  })

  // The frame is appended in an effect, so the stub attaches once the form has mounted.
  challenge = challengeFrameStub(container)
  await act(async () => challenge.solve())

  return root
}

/** Type the way React sees it: the native setter is what makes the input event count. */
async function type(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)

  if (!field) throw new Error(`no ${selector}`)

  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')?.set

  await act(async () => {
    setValue?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submitFilled(extra?: () => Promise<void>) {
  await type('#name', 'Ada Lovelace')
  await type('#email', 'ada@example.org')
  await extra?.()

  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

/** Payload's `APIError` envelope: the code, and any field, nested under `data`. */
const refusal = (code: string, status: number, field?: string) =>
  Object.assign(new Error('English server prose'), {
    errors: [{ message: 'English server prose', data: { code, field } }],
    status,
  })

const alertText = () => container.querySelector('[role="alert"]')?.textContent ?? ''
const alertClass = () => container.querySelector('[role="alert"]')?.className ?? ''

describe('RegistrationForm refusals', () => {
  // The address checks run in SahajCloud's write guard on `senderEmail`, for a
  // registration as much as a report. Before #259 these reached the visitor as
  // "Something went wrong" over the guard's English sentence.
  it.each([
    ['invalid_email', 'common.report_errors.email'],
    ['disposable_email', 'common.report_errors.disposable_email'],
  ])('puts %s on the email field, in the report form’s words', async (code, key) => {
    sdk.request.mockRejectedValue(refusal(code, 400, 'senderEmail'))

    const root = await mountForm()

    await submitFilled()

    const email = container.querySelector<HTMLInputElement>('#email')

    expect(container.querySelector('#email-error')?.textContent).toBe(key)
    expect(email?.getAttribute('aria-invalid')).toBe('true')
    expect(email?.getAttribute('aria-describedby')).toBe('email-error')
    expect(document.activeElement).toBe(email)
    // Said once, on the field: the form-level alert would repeat the same sentence.
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(container.textContent).not.toContain('registration.form.error_title')
    expect(container.textContent).not.toContain('English server prose')

    await act(async () => root.unmount())
  })

  it('puts a link refusal on the answer that carried it', async () => {
    sdk.request.mockRejectedValue(refusal('urls_not_allowed', 400, 'questions'))

    const root = await mountForm()

    await submitFilled(() => type('#questions\\.questions', 'see www.example.com'))

    const answer = container.querySelector('#questions\\.questions')

    expect(container.querySelector('[id="questions.questions-error"]')?.textContent).toBe(
      'common.report_errors.urls_not_allowed',
    )
    expect(answer?.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(answer)

    await act(async () => root.unmount())
  })

  it('puts a link in the name on the name field', async () => {
    // The client schema refuses most of a URL's characters, so this is the
    // server's half of the name rule: `checkSubmissionData` names the key.
    sdk.request.mockRejectedValue(refusal('urls_not_allowed', 400, 'name'))

    const root = await mountForm()

    await submitFilled()

    expect(container.querySelector('#name-error')?.textContent).toBe(
      'common.report_errors.urls_not_allowed',
    )
    expect(document.activeElement).toBe(container.querySelector('#name'))

    await act(async () => root.unmount())
  })

  // Only a refusal about the event means the cached copy is stale. Refetching
  // on a refused address would flip nothing and cost a read.
  it.each([
    ['event_full', 409, true],
    ['event_not_found', 404, true],
    ['disposable_email', 400, false],
    ['captcha_failed', 403, false],
  ])('refetches the event after %s: %s', async (code, status, refetches) => {
    sdk.request.mockRejectedValue(refusal(code as string, status as number, 'senderEmail'))

    const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const root = await mountForm(client)

    await submitFilled()

    expect(invalidate).toHaveBeenCalledTimes(refetches ? 1 : 0)

    await act(async () => root.unmount())
  })

  it('clears a field refusal once the visitor edits the field', async () => {
    sdk.request.mockRejectedValue(refusal('disposable_email', 400, 'senderEmail'))

    const root = await mountForm()

    await submitFilled()
    expect(container.querySelector('#email-error')).not.toBeNull()

    await type('#email', 'ada@real.example.org')

    expect(container.querySelector('#email-error')).toBeNull()

    await act(async () => root.unmount())
  })

  it.each([
    ['captcha_failed', 403, 'registration.form.captcha_retry'],
    ['captcha_unavailable', 500, 'registration.form.captcha_retry'],
    ['content_unscannable', 400, 'registration.form.captcha_retry'],
    ['event_not_found', 404, 'common.errors.unavailable'],
    ['event_full', 409, 'event.display.class_full'],
    // A link refusal naming no field this form renders still gets its sentence.
    ['urls_not_allowed', 400, 'common.report_errors.urls_not_allowed'],
  ])('says %s in its own sentence, not the generic one', async (code, status, key) => {
    sdk.request.mockRejectedValue(refusal(code, status))

    const root = await mountForm()

    await submitFilled()

    expect(alertText()).toBe(key)
    expect(alertClass()).not.toContain('danger')
    expect(container.textContent).not.toContain('registration.form.error_title')
    expect(container.textContent).not.toContain('English server prose')

    await act(async () => root.unmount())
  })

  it('tells the visitor what to do on an uncoded failure, and resets the spent challenge', async () => {
    // A 500 after the guard ran: the token is spent, and the body names no code.
    sdk.request.mockRejectedValue(
      Object.assign(new Error('Something went wrong.'), {
        errors: [{ message: 'Something went wrong.' }],
        status: 500,
      }),
    )

    const root = await mountForm()

    await submitFilled()

    expect(alertText()).toContain('registration.form.error_title')
    expect(alertText()).toContain('registration.form.captcha_retry')
    expect(alertText()).not.toContain('Something went wrong.')
    expect(alertClass()).toContain('danger')
    expect(challenge.resetCount()).toBe(1)

    await act(async () => root.unmount())
  })

  // A request the browser never delivered — here a rejected CORS preflight, which is how
  // every atlas registration failed until SahajCloud allowed the token header — got no
  // response, so the captcha was never the problem and asking for it again cannot help.
  it.each([
    [true, 'common.errors.server'],
    [false, 'common.errors.offline'],
  ])(
    'blames the connection, not the captcha, when nothing answered (online: %s)',
    async (online, key) => {
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)

      sdk.request.mockRejectedValue(new TypeError('Failed to fetch'))

      const root = await mountForm()

      await submitFilled()

      expect(alertText()).toContain('registration.form.error_title')
      expect(alertText()).toContain(key)
      expect(alertText()).not.toContain('registration.form.captcha_retry')
      expect(alertClass()).toContain('danger')
      expect(challenge.resetCount()).toBe(1)

      onLine.mockRestore()
      await act(async () => root.unmount())
    },
  )
})

// The cases above reject the request while React Query still believes it is online: it never
// reads `navigator.onLine`, only the `online` and `offline` events. Here it has seen the browser
// go offline, and the form mounts under the app's own client, because what answers for an
// offline submit is that client's mutation default rather than anything the form sets.
describe('RegistrationForm, submitted while the browser is offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
    queryClient.clear()
  })

  it('makes the attempt and says the connection failed, instead of pausing until it returns', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    sdk.request.mockRejectedValue(new TypeError('Failed to fetch'))

    const root = await mountForm(queryClient)

    onlineManager.setOnline(false)
    await submitFilled()

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(alertText()).toContain('registration.form.error_title')
    expect(alertText()).toContain('common.errors.offline')
    expect(challenge.resetCount()).toBe(1)

    // Nothing is left queued to send by itself once the connection is back.
    await act(async () => onlineManager.setOnline(true))

    expect(sdk.request).toHaveBeenCalledTimes(1)

    onLine.mockRestore()
    await act(async () => root.unmount())
  })
})

describe('RegistrationForm submit', () => {
  it('sends a token once when two submits clear validation together', async () => {
    // A 500 after the guard spent the token: a second request queued behind it would send the
    // same spent token, and its refusal would replace the first failure on screen.
    sdk.request.mockRejectedValue(
      Object.assign(new Error('Something went wrong.'), {
        errors: [{ message: 'Something went wrong.' }],
        status: 500,
      }),
    )

    const root = await mountForm()

    await type('#name', 'Ada Lovelace')
    await type('#email', 'ada@example.org')

    const form = container.querySelector('form')

    // Two Enter presses inside one validation pass: both callbacks run before React re-renders.
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(sdk.request).toHaveBeenCalledTimes(1)

    await act(async () => root.unmount())
  })
})

describe('RegistrationForm challenge line', () => {
  const line = () => container.querySelector('p[aria-live="polite"]')?.textContent

  it('asks for the click only once the challenge asks for one', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <RegistrationForm
            eventId={42}
            eventTitle="Evening meditation"
            isOnline={false}
            questions={['questions']}
            upcomingDates={[new Date('2026-12-01T18:00:00Z')]}
          />
        </QueryClientProvider>,
      )
    })

    const frame = container.querySelector('iframe') as HTMLIFrameElement

    act(() => sendFromFrame(frame, { type: 'ready' }))
    expect(line()).toBe('registration.form.checking')

    act(() => sendFromFrame(frame, { type: 'interactive' }))
    expect(line()).toBe('registration.form.security_check')

    act(() => sendFromFrame(frame, { type: 'settled' }))
    expect(line()).toBe('registration.form.checking')

    act(() => sendFromFrame(frame, { type: 'token', token: 'tok-1' }))
    expect(line()).toBe('')

    await act(async () => root.unmount())
  })
})
