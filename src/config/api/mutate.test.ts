import type { ReportContext } from '@/lib/report'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import z from 'zod'

import mutate, { ContactRefusedError, RegistrationRefusedError } from './mutate'

// Same boundary mock as fetch.test.ts: the SDK is stubbed so `requestJson` runs
// against a controlled Response, and i18n is stubbed so importing the client
// doesn't boot the real HTTP backend.
const sdk = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), request: vi.fn() }))

vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = sdk.find
    findByID = sdk.findByID
    request = sdk.request
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'fr' } }))

const jsonResponse = (data: unknown) => ({ json: async () => data })

/** What the SDK throws on a non-2xx: the response body's `errors` array verbatim. */
class FakeSDKError extends Error {
  constructor(
    readonly errors: { message?: string; code?: string }[],
    readonly status: number,
  ) {
    super(errors[0]?.message ?? 'Request failed')
  }
}

const registration = {
  name: 'Ada',
  email: 'ada@example.org',
  startingAt: new Date('2026-08-12T18:30:00Z'),
}

/** A solved Turnstile token, as the form would hand one over. */
const CAPTCHA_TOKEN = '0.solved-challenge'

beforeEach(() => {
  sdk.request.mockReset()
})

describe('createRegistration', () => {
  it('posts the registrant plus the active locale, and parses the confirmation', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, registration: { id: 7, uuid: 'abc' } }))

    const result = await mutate.createRegistration(42, registration, CAPTCHA_TOKEN)

    expect(result).toEqual({ ok: true, registration: { id: 7, uuid: 'abc' } })

    const [options] = sdk.request.mock.calls[0]

    expect(options.path).toBe('/events/42/register')
    // Without this the CMS falls back to its own default and every registrant
    // gets an English confirmation email.
    expect(options.json.locale).toBe('fr')
    expect(options.json.startingAt).toBe('2026-08-12T18:30:00.000Z')
  })

  // The header, not the body — SahajCloud's write-guard is a plugin above the handlers, so
  // it reads one header name for every endpoint rather than each one's body shape
  // (sydevs/SahajCloud#629). A token in the body would be a 403 with no way to tell why.
  it('sends the solved token in the x-turnstile-token header, not the body', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, registration: { id: 7, uuid: 'abc' } }))

    await mutate.createRegistration(42, registration, CAPTCHA_TOKEN)

    const [options] = sdk.request.mock.calls[0]

    expect(new Headers(options.init.headers).get('x-turnstile-token')).toBe(CAPTCHA_TOKEN)
    expect(JSON.stringify(options.json)).not.toContain(CAPTCHA_TOKEN)
  })

  // `captcha_failed` is thrown by the write-guard rather than by the endpoint's own state
  // checks, so it is NOT in the synced `EventRegistrationErrorCode` union — and it has to
  // survive `asRefusal` regardless, or a spent token would reach the form as a generic
  // "something went wrong" with no hint that retrying is what to do.
  it('re-casts a refused captcha as a RegistrationRefusedError, though its code is unsynced', async () => {
    sdk.request.mockRejectedValue(
      new FakeSDKError([{ message: 'Captcha verification failed.', code: 'captcha_failed' }], 403),
    )

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toMatchObject({
      code: 'captcha_failed',
    })
  })

  it('re-casts a 409 refusal as a RegistrationRefusedError carrying the code', async () => {
    sdk.request.mockRejectedValue(
      new FakeSDKError([{ message: 'This event is full.', code: 'event_full' }], 409),
    )

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toThrowError(
      RegistrationRefusedError,
    )
    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toMatchObject({
      code: 'event_full',
      message: 'This event is full.',
    })
  })

  it('passes non-refusal failures through untouched', async () => {
    // A 404 carries no `code` — it must stay a plain error so the form shows the
    // generic "something went wrong" treatment rather than a state message.
    const notFound = new FakeSDKError([{ message: 'Not Found' }], 404)

    sdk.request.mockRejectedValue(notFound)

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toBe(notFound)
  })

  it('passes a transport failure (no errors array) through untouched', async () => {
    const offline = new TypeError('Failed to fetch')

    sdk.request.mockRejectedValue(offline)

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toBe(offline)
  })
})

const context: ReportContext = {
  path: '/india/pune/e/42',
  pageUrl: 'https://host.example/find-a-class',
  locale: 'en',
  client: 'Sahaja Yoga UK',
  userAgent: 'Mozilla/5.0 (Macintosh)',
}

const report = { message: 'The venue address is wrong.', turnstileToken: 'tok-1', context }

describe('contactAdmin', () => {
  it('posts the report to the shared endpoint and parses the receipt', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    await expect(mutate.contactAdmin({ ...report, email: 'ada@example.org' })).resolves.toEqual({
      ok: true,
    })

    const [options] = sdk.request.mock.calls[0]

    expect(options.method).toBe('POST')
    expect(options.path).toBe('/contact-admin')
    expect(options.json.message).toBe('The venue address is wrong.')
    expect(options.json.email).toBe('ada@example.org')
    // The endpoint is general-purpose; the Atlas framing is this caller's subject.
    expect(options.json.subject).toBe('Issue report')
    // A captcha-gated endpoint verifies the token SERVER-side — it has to travel in the
    // body, not just be solved in the browser.
    expect(options.json.turnstileToken).toBe('tok-1')
  })

  it('maps our context onto the endpoint’s, dropping the client it derives itself', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    await mutate.contactAdmin(report)

    const [options] = sdk.request.mock.calls[0]

    // Ours is `pageUrl`, theirs is `hostUrl`. A silent rename here would drop the host
    // page from every report while every gate stayed green.
    expect(options.json.context).toEqual({
      path: '/india/pune/e/42',
      hostUrl: 'https://host.example/find-a-class',
      locale: 'en',
      userAgent: 'Mozilla/5.0 (Macintosh)',
    })
    // The service name comes from the authenticated API key server-side; sending our
    // cached copy would be a second, forgeable source for the same row.
    expect(options.json.context).not.toHaveProperty('client')
  })

  it('omits a blank reply address rather than sending an empty Reply-To', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    await mutate.contactAdmin({ ...report, email: '' })

    expect(sdk.request.mock.calls[0][0].json).not.toHaveProperty('email')
  })

  it('clamps context values to the bounds the endpoint enforces', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    await mutate.contactAdmin({
      ...report,
      context: { ...context, userAgent: 'U'.repeat(900), error: 'E'.repeat(2500) },
    })

    // Over-bound context is a 400 for the WHOLE message — losing a bug report to a long
    // browser string would be the worst possible trade.
    const sent = sdk.request.mock.calls[0][0].json.context

    expect(sent.userAgent).toHaveLength(500)
    expect(sent.error).toHaveLength(2000)
  })

  it('re-casts a 403 captcha rejection as a ContactRefusedError carrying the code', async () => {
    sdk.request.mockRejectedValue(
      new FakeSDKError(
        [{ message: 'Captcha verification failed. Please try again.', code: 'captcha_failed' }],
        403,
      ),
    )

    // The form resets its challenge on this, so the sender can retry in place.
    await expect(mutate.contactAdmin(report)).rejects.toBeInstanceOf(ContactRefusedError)
    await expect(mutate.contactAdmin(report)).rejects.toMatchObject({ code: 'captcha_failed' })
  })

  it('passes an uncoded failure through untouched — a 502 means the email never sent', async () => {
    // The endpoint answers 502 rather than a false 200 when the mail provider refuses,
    // so this MUST reach the form as a failure.
    const badGateway = new FakeSDKError([{ message: 'Could not deliver your message.' }], 502)

    sdk.request.mockRejectedValue(badGateway)

    await expect(mutate.contactAdmin(report)).rejects.toBe(badGateway)
  })

  it('rejects a success body that is not the contract, as a parse failure', async () => {
    // `ok: true` is the whole receipt — nothing is persisted — so the parse is the only
    // thing standing between a shape change and a thank-you screen for a lost report.
    sdk.request.mockResolvedValue(jsonResponse({ ok: false }))

    // NOT a ContactRefusedError. A ZodError's `.errors` are `{ message, code }` — the
    // very shape a refusal body has — so a `.parse()` inside the request's catch would be
    // re-cast as a server refusal carrying a zod issue code. A bare `.rejects.toThrow()`
    // passes either way and would have certified that bug.
    await expect(mutate.contactAdmin(report)).rejects.toBeInstanceOf(z.ZodError)
    await expect(mutate.contactAdmin(report)).rejects.not.toBeInstanceOf(ContactRefusedError)
  })
})

describe('reportEmbed', () => {
  const embedReport = {
    origin: 'https://sahajayoga.nl',
    pathname: '/lessons',
    mode: 'inline',
    routing: 'query',
    topLevel: true,
    urlWritable: true,
    paramPersisted: true,
    canonicalViable: true,
  } as const

  it('posts the observation and parses the confirmation', async () => {
    sdk.request.mockResolvedValue(
      jsonResponse({ ok: true, mount: 'https://sahajayoga.nl/lessons', stored: true }),
    )

    await expect(mutate.reportEmbed(embedReport)).resolves.toMatchObject({ ok: true })
    expect(sdk.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/clients/report',
      json: embedReport,
    })
  })

  /**
   * `ok` is the whole receipt. The endpoint also returns `mount` and `stored`, and neither is in
   * the schema on purpose — nothing consumes them, so pinning them would turn a harmless rename
   * on the CMS side into a console warning on every host page. What must still fail is a response
   * that does not say the report was accepted.
   */
  it('accepts the receipt while ignoring the fields nothing reads', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'renamed-away' }))

    await expect(mutate.reportEmbed(embedReport)).resolves.toMatchObject({ ok: true })
  })

  it('rejects a response that does not confirm the write', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: false }))

    await expect(mutate.reportEmbed(embedReport)).rejects.toBeInstanceOf(z.ZodError)
  })
})
