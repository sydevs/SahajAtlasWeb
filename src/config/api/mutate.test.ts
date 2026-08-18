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

beforeEach(() => {
  sdk.request.mockReset()
})

describe('createRegistration', () => {
  it('posts the registrant plus the active locale, and parses the confirmation', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, registration: { id: 7, uuid: 'abc' } }))

    const result = await mutate.createRegistration(42, registration)

    expect(result).toEqual({ ok: true, registration: { id: 7, uuid: 'abc' } })

    const [options] = sdk.request.mock.calls[0]

    expect(options.path).toBe('/events/42/register')
    // Without this the CMS falls back to its own default and every registrant
    // gets an English confirmation email.
    expect(options.json.locale).toBe('fr')
    expect(options.json.startingAt).toBe('2026-08-12T18:30:00.000Z')
  })

  it('re-casts a 409 refusal as a RegistrationRefusedError carrying the code', async () => {
    sdk.request.mockRejectedValue(
      new FakeSDKError([{ message: 'This event is full.', code: 'event_full' }], 409),
    )

    await expect(mutate.createRegistration(42, registration)).rejects.toThrowError(
      RegistrationRefusedError,
    )
    await expect(mutate.createRegistration(42, registration)).rejects.toMatchObject({
      code: 'event_full',
      message: 'This event is full.',
    })
  })

  it('passes non-refusal failures through untouched', async () => {
    // A 404 carries no `code` — it must stay a plain error so the form shows the
    // generic "something went wrong" treatment rather than a state message.
    const notFound = new FakeSDKError([{ message: 'Not Found' }], 404)

    sdk.request.mockRejectedValue(notFound)

    await expect(mutate.createRegistration(42, registration)).rejects.toBe(notFound)
  })

  it('passes a transport failure (no errors array) through untouched', async () => {
    const offline = new TypeError('Failed to fetch')

    sdk.request.mockRejectedValue(offline)

    await expect(mutate.createRegistration(42, registration)).rejects.toBe(offline)
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

    await expect(mutate.reportEmbed(embedReport)).resolves.toEqual({
      ok: true,
      mount: 'https://sahajayoga.nl/lessons',
      stored: true,
    })
    expect(sdk.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/clients/report',
      json: embedReport,
    })
  })

  // The endpoint's schema strips it; we send it anyway, because the payload is the observation
  // entire and `canonicalViable` is the widget's own summary of the three fields beside it.
  it('sends the whole observation, including the field the endpoint does not model', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await mutate.reportEmbed(embedReport)

    expect(sdk.request.mock.calls[0][0].json).toHaveProperty('canonicalViable')
  })

  // Same rule as every other mutation here: the parse sits outside the request's try, so a shape
  // change surfaces as a ZodError rather than being re-cast as something the server said.
  it('rejects a confirmation that is not the contract', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x' }))

    await expect(mutate.reportEmbed(embedReport)).rejects.toBeInstanceOf(z.ZodError)
  })
})
