import type { ReportContext } from '@/lib/report'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import z from 'zod'

import mutate, { UserMessageRefusedError, RegistrationRefusedError } from './mutate'

// This uses the same boundary mock as `fetch.test.ts`.
// It stubs the SDK, so `requestJson` runs against a controlled Response.
// It also stubs i18n, so importing the client does not boot the real HTTP backend.
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

/** This is what the SDK throws on a non-2xx: the response body's `errors` array, verbatim. */
class FakeSDKError extends Error {
  constructor(
    readonly errors: { message?: string; code?: string; data?: { code?: string } }[],
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

/** This is a solved Turnstile token, as the form would hand one over. */
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
    // Without this value, the CMS falls back to its own default, and every registrant gets an English confirmation email.
    expect(options.json.locale).toBe('fr')
    expect(options.json.startingAt).toBe('2026-08-12T18:30:00.000Z')
  })

  // This checks the header, not the body.
  // SahajCloud's write-guard is a plugin above the handlers, so it reads one header name for every endpoint, not each one's body shape. See sydevs/SahajCloud#629.
  // A token in the body would produce a 403 with no way to tell why.
  it('sends the solved token in the x-turnstile-token header, not the body', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, registration: { id: 7, uuid: 'abc' } }))

    await mutate.createRegistration(42, registration, CAPTCHA_TOKEN)

    const [options] = sdk.request.mock.calls[0]

    expect(new Headers(options.init.headers).get('x-turnstile-token')).toBe(CAPTCHA_TOKEN)
    expect(JSON.stringify(options.json)).not.toContain(CAPTCHA_TOKEN)
  })

  // The write-guard throws `captcha_failed`, not the endpoint's own state checks.
  // So this code is NOT in the synced `EventRegistrationErrorCode` union.
  // It must still survive `asRefusal` regardless.
  // Otherwise a spent token would reach the form as a generic "something went wrong," with no hint that retrying is what to do.
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
    // A 404 carries no `code`.
    // It must stay a plain error, so the form shows the generic "something went wrong" treatment, not a state message.
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

describe('sendUserMessage', () => {
  const created = { doc: { id: 42 }, message: 'Created successfully.' }

  it('creates the message on the collection and parses the create envelope', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await expect(mutate.sendUserMessage({ ...report, email: 'ada@example.org' })).resolves.toEqual({
      doc: { id: 42 },
    })

    const [options] = sdk.request.mock.calls[0]

    expect(options.method).toBe('POST')
    expect(options.path).toBe('/user-messages')
    expect(options.json.message).toBe('The venue address is wrong.')
    // The endpoint's field is `senderEmail`. Ours is `email`.
    // A dropped rename here would silently strip the Reply-To from every report that carries one.
    expect(options.json.senderEmail).toBe('ada@example.org')
    expect(options.json).not.toHaveProperty('email')
    // The intake is general-purpose. The Atlas framing is this caller's subject.
    expect(options.json.subject).toBe('Issue report')
  })

  it('sends the captcha token as a header, never in the body', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendUserMessage(report)

    const [options] = sdk.request.mock.calls[0]

    // The write-guard is a plugin above every collection, so it reads one header, not each body shape.
    // A token left in the body is not read at all.
    // The create would be refused as `captcha_failed`, with the token sitting right there.
    expect(options.init.headers['x-turnstile-token']).toBe('tok-1')
    expect(options.json).not.toHaveProperty('turnstileToken')
  })

  it('maps our context onto the collection’s, dropping the client it derives itself', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendUserMessage(report)

    const [options] = sdk.request.mock.calls[0]

    // Ours is `pageUrl`. Theirs is `hostUrl`.
    // A silent rename here would drop the host page from every report, while every gate stayed green.
    expect(options.json.context).toEqual({
      path: '/india/pune/e/42',
      hostUrl: 'https://host.example/find-a-class',
      locale: 'en',
      userAgent: 'Mozilla/5.0 (Macintosh)',
    })
    // The server derives the client from the authenticated API key.
    // Sending our cached copy would be a second, forgeable source for the same row.
    expect(options.json.context).not.toHaveProperty('client')
  })

  it('omits a blank reply address rather than sending an empty Reply-To', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendUserMessage({ ...report, email: '' })

    expect(sdk.request.mock.calls[0][0].json).not.toHaveProperty('senderEmail')
  })

  it('clamps context values to the bound the collection enforces', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendUserMessage({
      ...report,
      context: { ...context, userAgent: 'U'.repeat(2500), error: 'E'.repeat(2500) },
    })

    // An over-bound context produces a 400 for the WHOLE message.
    // Losing a bug report to a long browser string would be the worst possible trade.
    // The `context` JSON schema in SahajCloud's UserMessages collection bounds every key at 2000.
    const sent = sdk.request.mock.calls[0][0].json.context

    expect(sent.userAgent).toHaveLength(2000)
    expect(sent.error).toHaveLength(2000)
  })

  it('re-casts a refusal whose code sits under `data`, which is where Payload puts it', async () => {
    sdk.request.mockRejectedValue(
      new FakeSDKError(
        [
          {
            message: 'Captcha verification failed. Please try again.',
            data: { code: 'captcha_failed' },
          },
        ],
        403,
      ),
    )

    // Collection-backed routes go through Payload's `formatErrors`, which nests the APIError payload under `data`.
    // So a client reading only `errors[].code` sees an uncoded failure, and shows the generic sentence instead of the captcha copy.
    await expect(mutate.sendUserMessage(report)).rejects.toBeInstanceOf(UserMessageRefusedError)
    await expect(mutate.sendUserMessage(report)).rejects.toMatchObject({ code: 'captcha_failed' })
  })

  it.each(['disposable_email', 'urls_not_allowed', 'invalid_email', 'captcha_unavailable'])(
    'carries the %s code through to the caller',
    async (code) => {
      sdk.request.mockRejectedValue(
        new FakeSDKError([{ message: 'Refused.', data: { code } }], 400),
      )

      // Each of these codes routes to its own copy in `ReportIssueForm`'s `REFUSAL_MESSAGE_KEYS`.
      // Losing the code loses the sentence, not the failure.
      await expect(mutate.sendUserMessage(report)).rejects.toMatchObject({ code })
    },
  )

  it('passes an uncoded failure through untouched', async () => {
    const serverError = new FakeSDKError([{ message: 'Something went wrong.' }], 500)

    sdk.request.mockRejectedValue(serverError)

    await expect(mutate.sendUserMessage(report)).rejects.toBe(serverError)
  })

  it('rejects a success body that is not a create envelope, as a parse failure', async () => {
    // The old endpoint's receipt was `{ ok: true }`.
    // Accepting any 2xx response would put the thank-you screen in front of a sender whose message went nowhere.
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    // This must NOT be a `UserMessageRefusedError`.
    // A `ZodError`'s `.errors` field is `{ message, code }`, the very shape a refusal body has.
    // So a `.parse()` call inside the request's catch would get re-cast as a server refusal carrying a zod issue code.
    // A bare `.rejects.toThrow()` would pass either way, and would have certified that bug.
    await expect(mutate.sendUserMessage(report)).rejects.toBeInstanceOf(z.ZodError)
    await expect(mutate.sendUserMessage(report)).rejects.not.toBeInstanceOf(UserMessageRefusedError)
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
   * `ok` is the whole receipt this schema checks.
   * The endpoint also returns `mount` and `stored`. Neither is in the schema, on purpose.
   * Nothing consumes them, so pinning them would turn a harmless rename on the CMS side into a console warning on every host page.
   * What must still fail is a response that does not say the report was accepted.
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
