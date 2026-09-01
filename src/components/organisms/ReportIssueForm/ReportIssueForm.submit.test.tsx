// @vitest-environment jsdom
//
// The second spec in the unit lane to boot a DOM, opted in per-file so the rest stays
// node-only (see `CLAUDE.md § Testing`). It earns that the same way `reset-boundary`
// does: what it covers is a re-render SSR markup cannot express — the screen you land on
// AFTER an async submit resolves or rejects.
//
// And it is the one assertion issue #103 is actually about. The old form called
// `window.alert(JSON.stringify(payload))` and then `setSubmitted(true)`, so every report
// showed the thank-you screen and none of them reached a server. Its sibling spec can
// only drive the story props (`initialSubmitted` / `initialFailed`), both of which
// short-circuit the derivation — so with that spec alone, restoring the bug keeps the
// lane green. Here the ONLY way to the thank-you screen is a resolved POST.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportIssueForm } from './ReportIssueForm'

import { type ReportContext } from '@/lib/report'

// Mocked at the SDK boundary, not at our own `api` module: that keeps the real
// `contactAdmin` — its body mapping, its zod parse, its refusal re-cast — inside the
// system under test, so this spec covers the JOIN between the endpoint and the screen.
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
    t: (key: string) =>
      ({
        'report.sent': 'THANKYOU',
        'report.errors.send_failed': 'SEND_FAILED',
        'report.errors.captcha': 'CAPTCHA_FAILED',
        'report.submit': 'Send report',
      })[key] ?? key,
    i18n: { on: () => {}, off: () => {}, resolvedLanguage: 'en' },
  }),
}))

const context: ReportContext = {
  path: '/india/pune/e/42',
  pageUrl: 'https://host.example/classes',
  locale: 'en',
  userAgent: 'TestAgent/1.0',
}

let container: HTMLDivElement
let resetCalls: number

beforeEach(() => {
  sdk.request.mockReset()
  resetCalls = 0

  // Stand in for the Turnstile script rather than for OUR hook: `loadTurnstile` short-
  // circuits when `window.turnstile` already exists, so the real `useTurnstile` runs and
  // solves through its own callback — which is what gives the form a token and enables
  // Send. Mocking the hook instead would skip the very wiring under test.
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

/** Mount the form and let the captcha's callback settle, so Send is enabled. */
async function mountForm() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 0 } } })
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ReportIssueForm context={context} onClose={() => {}} />
      </QueryClientProvider>,
    )
  })

  return root
}

/**
 * Type into a control the way React sees it. Assigning `.value` directly is invisible to
 * React's value tracker, so the change never reaches react-hook-form and the form stays
 * invalid — the native setter is what makes the input event count.
 */
async function type(selector: string, value: string) {
  const field = container.querySelector<HTMLTextAreaElement>(selector)

  if (!field) throw new Error(`no ${selector}`)

  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')?.set

  await act(async () => {
    setValue?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit() {
  const form = container.querySelector('form')

  await act(async () => {
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

const MESSAGE = 'The venue address on this class is wrong.'

describe('ReportIssueForm submit', () => {
  it('shows the thank-you screen only after the POST actually resolves', async () => {
    sdk.request.mockResolvedValue({ json: async () => ({ ok: true }) })

    const root = await mountForm()

    await type('#report-message', MESSAGE)
    // Before the submit there is no thank-you — and the request has not been made.
    expect(container.textContent).not.toContain('THANKYOU')
    expect(sdk.request).not.toHaveBeenCalled()

    await submit()

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(sdk.request.mock.calls[0][0].path).toBe('/contact-admin')
    expect(sdk.request.mock.calls[0][0].json.message).toBe(MESSAGE)
    expect(container.textContent).toContain('THANKYOU')

    await act(async () => root.unmount())
  })

  it('does NOT show the thank-you screen when the send fails', async () => {
    // A 502: the endpoint verified the captcha but the mail provider refused, so the
    // report reached nobody. This is the case the old `window.alert` path called success.
    sdk.request.mockRejectedValue(
      Object.assign(new Error('Could not deliver your message.'), {
        errors: [{ message: 'Could not deliver your message.' }],
        status: 502,
      }),
    )

    const root = await mountForm()

    await type('#report-message', MESSAGE)
    await submit()

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('THANKYOU')
    expect(container.textContent).toContain('SEND_FAILED')
    // The typed message survives, so the retry costs nothing to compose.
    expect(container.querySelector<HTMLTextAreaElement>('#report-message')?.value).toBe(MESSAGE)

    await act(async () => root.unmount())
  })

  it('resets the captcha after a failure, because the token may already be spent', async () => {
    // The endpoint redeems a single-use token during verification, BEFORE it mails. So on
    // a 502 the token in hand is spent and re-sending it would be refused as a replay —
    // the retry the failure copy offers only works if the challenge is re-run.
    sdk.request.mockRejectedValue(
      Object.assign(new Error('Could not deliver your message.'), { status: 502 }),
    )

    const root = await mountForm()

    await type('#report-message', MESSAGE)
    expect(resetCalls).toBe(0)

    await submit()

    expect(resetCalls).toBe(1)

    await act(async () => root.unmount())
  })

  it('renders the captcha refusal copy for a 403, not the generic sentence', async () => {
    sdk.request.mockRejectedValue(
      Object.assign(new Error('Captcha verification failed.'), {
        errors: [{ message: 'Captcha verification failed.', code: 'captcha_failed' }],
        status: 403,
      }),
    )

    const root = await mountForm()

    await type('#report-message', MESSAGE)
    await submit()

    // The one branch the SSR spec cannot reach: it needs a REJECTED mutation carrying the
    // endpoint's machine-readable code.
    expect(container.textContent).toContain('CAPTCHA_FAILED')
    expect(container.textContent).not.toContain('SEND_FAILED')
    expect(container.textContent).not.toContain('THANKYOU')

    await act(async () => root.unmount())
  })
})
