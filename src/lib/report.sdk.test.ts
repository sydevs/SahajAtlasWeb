// @vitest-environment jsdom

/**
 * The Sentry seam against the REAL `@sentry/browser`, read off the wire (#108).
 *
 * `report.sentry.test.ts` mocks the SDK, so it pins the options we pass and never what the SDK
 * makes of them. A default the SDK applies on its own is invisible there: a major version can
 * turn one on, or start ignoring the value that pinned it, while that suite stays green. Only
 * `fetch` is stubbed here — the page's own, which the transport posts through.
 *
 * The host page below runs its own Sentry and carries secrets in its URL. Every value it owns
 * starts with `host-`, so one string check covers each way one could ride out on our event.
 */
import type { reportInternalError as ReportInternalError } from './report'

import { beforeAll, expect, it, vi } from 'vitest'

const DSN = 'https://publickey@o0.ingest.sentry.io/0'

type Sent = {
  url: string
  body: string
  header: { trace?: Record<string, unknown> }
  event: {
    release?: string
    sdk?: { settings?: { infer_ip?: string } }
    exception?: { values?: Array<{ value?: string; stacktrace?: unknown }> }
  }
}

const sent: Sent[] = []
let report: typeof ReportInternalError

beforeAll(async () => {
  vi.stubEnv('VITE_SENTRY_DSN', DSN)

  window.history.replaceState(
    {},
    '',
    '/classes/london?reset_token=host-token&atlas=%2Fnl%2Famsterdam#access_token=host-oauth',
  )
  Object.assign(window, {
    SENTRY_RELEASE: { id: 'host-window-release' },
    __SENTRY_RELEASE__: 'host-global-release',
  })
  document.head.insertAdjacentHTML(
    'beforeend',
    '<meta name="sentry-release" content="host-meta-release">',
  )

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { body: string | Uint8Array }) => {
      const body = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body)
      const [header, , event] = body.split('\n').map((line) => JSON.parse(line))

      sent.push({ url: String(url), body, header, event })

      return new Response('{}')
    }),
  )

  // The global scope is shared with any Sentry on the page running this same SDK version.
  const { getGlobalScope } = await import('@sentry/browser')

  getGlobalScope().setTag('tenant', 'host-tenant')
  getGlobalScope().setUser({ email: 'host-user@example.com' })
  getGlobalScope().setExtra('session', 'host-session')

  report = (await import('./report')).reportInternalError
})

/** Reports one failure and returns the request it produced. */
async function capture(error: unknown): Promise<Sent> {
  const before = sent.length

  report(error, 'ctx')
  await vi.waitFor(() => expect(sent).toHaveLength(before + 1))

  return sent[before] as Sent
}

it('posts the event to the DSN’s own ingest host, carrying nothing the host page owns', async () => {
  const { url, body, event } = await capture(new Error('boom'))

  expect(new URL(url).origin).toBe('https://o0.ingest.sentry.io')
  expect(event.exception?.values?.[0]?.value).toBe('boom')
  // The host's release (window global, define global and meta tag alike), its scope, its
  // query and its fragment.
  expect(body).not.toContain('host-')
  expect(event).not.toHaveProperty('release')
})

it('asks Sentry not to store the visitor’s IP address', async () => {
  const { event } = await capture(new Error('ip'))

  // Inferred server-side from the request, so no `beforeSend` scrub can reach it.
  expect(event.sdk?.settings?.infer_ip).toBe('never')
})

it('gives a thrown non-Error no synthetic stack trace of the reporter’s own frames', async () => {
  const { event } = await capture('a thrown string')

  expect(event.exception?.values?.[0]?.value).toBe('a thrown string')
  expect(event.exception?.values?.[0]?.stacktrace).toBeUndefined()
})
