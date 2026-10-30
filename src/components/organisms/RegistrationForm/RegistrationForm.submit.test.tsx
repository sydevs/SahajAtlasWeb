// @vitest-environment jsdom
//
// A refusal reaches the screen only after an async submit rejects, which SSR
// markup cannot express — the same reason `ReportIssueForm.submit.test.tsx`
// boots a DOM. This mocks at the SDK boundary, so the real `createRegistration`
// and its refusal re-cast stay inside the system under test.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistrationForm } from './RegistrationForm'

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

let container: HTMLDivElement
let resetCalls: number

beforeEach(() => {
  sdk.request.mockReset()
  resetCalls = 0

  // The Turnstile script, not our hook: the real `useTurnstile` solves through
  // this callback, which is what hands the form a token.
  window.turnstile = {
    render: (_el, options) => {
      options.callback?.('tok-live')

      return 'widget-1'
    },
    remove: () => {},
    reset: () => {
      resetCalls += 1
    },
  }

  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
  delete window.turnstile
})

async function mountForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
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
    ['event_full', 409, 'event.display.event_full'],
    // A link refusal naming no field this form renders still gets its sentence.
    ['urls_not_allowed', 400, 'common.report_errors.urls_not_allowed'],
  ])('says %s in its own sentence, not the generic one', async (code, status, key) => {
    sdk.request.mockRejectedValue(refusal(code, status))

    const root = await mountForm()

    await submitFilled()

    expect(alertText()).toBe(key)
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
    expect(resetCalls).toBe(1)

    await act(async () => root.unmount())
  })
})
