import type { ReportContext } from '@/lib/report'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import z from 'zod'

import mutate, { UserSubmissionError, RegistrationRefusedError } from './mutate'

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

/** This reads one `submissionData` pair back out of a sent body, by its key. */
const pair = (json: { submissionData: { field: string; value: string }[] }, field: string) =>
  json.submissionData.find((entry) => entry.field === field)?.value

/** This is a solved Turnstile token, as the form would hand one over. */
const CAPTCHA_TOKEN = '0.solved-challenge'

beforeEach(() => {
  sdk.request.mockReset()
})

describe('createRegistration', () => {
  const created = { doc: { id: 7, uuid: 'abc' }, message: 'Created successfully.' }

  it('creates a registration row on the shared intake, and parses the create envelope', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    const result = await mutate.createRegistration(42, registration, CAPTCHA_TOKEN)

    // The uuid comes back from the create itself, not a later job, so the registrant has it the moment this resolves.
    expect(result).toEqual({ doc: { id: 7, uuid: 'abc' } })

    const [options] = sdk.request.mock.calls[0]

    // One collection carries all four intakes, so `type` is the only thing telling them apart.
    // A row created without it defaults to `contact` server-side, and the event gate never runs.
    expect(options.path).toBe('/user-submissions')
    expect(options.json.type).toBe('registration')
    expect(options.json.event).toBe(42)
    expect(options.json.startingAt).toBe('2026-08-12T18:30:00.000Z')
    // The collection's own column. Ours is `email`.
    expect(options.json.senderEmail).toBe('ada@example.org')
    expect(options.json).not.toHaveProperty('email')
  })

  it('carries the name, the active locale, and the answers as submissionData pairs', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.createRegistration(
      42,
      { ...registration, questions: { experience: 'Twice', referral: 'A friend' } },
      CAPTCHA_TOKEN,
    )

    const [options] = sdk.request.mock.calls[0]

    // Everything but the typed columns rides as `[{ field, value }]` now. An object would 400 the whole create.
    expect(options.json.submissionData).toContainEqual({ field: 'name', value: 'Ada' })
    // Without this value, the CMS falls back to its own default, and every registrant gets an English confirmation email.
    expect(pair(options.json, 'locale')).toBe('fr')
    expect(pair(options.json, 'experience')).toBe('Twice')
    expect(pair(options.json, 'referral')).toBe('A friend')
  })

  it('drops a blank answer rather than sending an empty pair', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.createRegistration(
      42,
      { ...registration, questions: { experience: '', referral: 'A friend' } },
      CAPTCHA_TOKEN,
    )

    const fields = sdk.request.mock.calls[0][0].json.submissionData.map(
      (entry: { field: string }) => entry.field,
    )

    // The collection caps a submission at 40 pairs, and an untouched textarea is not an answer.
    expect(fields).not.toContain('experience')
    expect(fields).toContain('referral')
  })

  // This checks the header, not the body.
  // SahajCloud's write-guard is a plugin above the handlers, so it reads one header name for every endpoint, not each one's body shape. See sydevs/SahajCloud#629.
  // A token in the body would produce a 403 with no way to tell why.
  it('sends the solved token in the x-turnstile-token header, not the body', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

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
    // `gateRegistration` throws a Payload `APIError`, so the code arrives nested under `data`.
    // The hand-written endpoint that put it at the top level is gone (SahajCloud#800).
    sdk.request.mockRejectedValue(
      new FakeSDKError([{ message: 'This event is full.', data: { code: 'event_full' } }], 409),
    )

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toThrowError(
      RegistrationRefusedError,
    )
    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toMatchObject({
      code: 'event_full',
      message: 'This event is full.',
    })
  })

  it('still reads a code from the flat position a pre-#800 CMS would send', async () => {
    // Both positions stay live in `RefusalBodySchema`. Reading only the nested one would turn every
    // refusal from an older deploy into the generic "try again" sentence.
    sdk.request.mockRejectedValue(
      new FakeSDKError([{ message: 'This course has started.', code: 'registration_closed' }], 409),
    )

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toMatchObject({
      code: 'registration_closed',
    })
  })

  it('carries a code the synced union does not know about', async () => {
    // The gate answers 404 with `event_not_found` now, where the old endpoint sent a bare 404.
    // The code is not in `EventRegistrationErrorCode`, so the form has no copy for it and falls back
    // to the generic sentence — but it must still arrive as a refusal rather than a raw failure.
    sdk.request.mockRejectedValue(
      new FakeSDKError(
        [
          {
            message: 'Event not found or not open for registration.',
            data: { code: 'event_not_found' },
          },
        ],
        404,
      ),
    )

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toMatchObject({
      code: 'event_not_found',
    })
  })

  it('passes non-refusal failures through untouched', async () => {
    // An uncoded failure must stay a plain error, so the form shows the generic "something went wrong" treatment, not a state message.
    const serverError = new FakeSDKError([{ message: 'Something went wrong.' }], 500)

    sdk.request.mockRejectedValue(serverError)

    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toBe(
      serverError,
    )
  })

  it('rejects a success body that is not a create envelope, as a parse failure', async () => {
    // The deleted endpoint's receipt was `{ ok: true, registration: {…} }`.
    // Accepting any 2xx body would show the confirmation screen to a registrant with no row behind it.
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, registration: { id: 7, uuid: 'abc' } }))

    // This must NOT be a `RegistrationRefusedError` — see the parse-outside-the-try rule below.
    await expect(mutate.createRegistration(42, registration, CAPTCHA_TOKEN)).rejects.toBeInstanceOf(
      z.ZodError,
    )
    await expect(
      mutate.createRegistration(42, registration, CAPTCHA_TOKEN),
    ).rejects.not.toBeInstanceOf(RegistrationRefusedError)
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

describe('sendReport', () => {
  const created = { doc: { id: 42 }, message: 'Created successfully.' }

  it('creates a contact row on the shared intake and parses the create envelope', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await expect(mutate.sendReport({ ...report, email: 'ada@example.org' })).resolves.toEqual({
      doc: { id: 42 },
    })

    const [options] = sdk.request.mock.calls[0]

    expect(options.method).toBe('POST')
    expect(options.path).toBe('/user-submissions')
    expect(options.json.type).toBe('contact')
    expect(pair(options.json, 'message')).toBe('The venue address is wrong.')
    // The collection's field is `senderEmail`. Ours is `email`.
    // A dropped rename here would silently strip the Reply-To from every report that carries one.
    expect(options.json.senderEmail).toBe('ada@example.org')
    expect(options.json).not.toHaveProperty('email')
    // The intake is general-purpose. The Atlas framing is this caller's subject.
    expect(pair(options.json, 'subject')).toBe('Issue report')
    // A form would decide the recipient and widen the keys this may send. This channel has one fixed destination.
    expect(options.json).not.toHaveProperty('form')
  })

  it('sends the captcha token as a header, never in the body', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendReport(report)

    const [options] = sdk.request.mock.calls[0]

    // The write-guard is a plugin above every collection, so it reads one header, not each body shape.
    // A token left in the body is not read at all.
    // The create would be refused as `captcha_failed`, with the token sitting right there.
    expect(options.init.headers['x-turnstile-token']).toBe('tok-1')
    expect(options.json).not.toHaveProperty('turnstileToken')
  })

  it('flattens our context into pairs, dropping the client it derives itself', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendReport(report)

    const [options] = sdk.request.mock.calls[0]

    // Ours is `pageUrl`. Theirs is `hostUrl`.
    // A silent rename here would drop the host page from every report, while every gate stayed green.
    expect(pair(options.json, 'path')).toBe('/india/pune/e/42')
    expect(pair(options.json, 'hostUrl')).toBe('https://host.example/find-a-class')
    expect(pair(options.json, 'locale')).toBe('en')
    expect(pair(options.json, 'userAgent')).toBe('Mozilla/5.0 (Macintosh)')
    // The `context` object is gone — a key the collection does not accept 400s the whole report.
    expect(options.json).not.toHaveProperty('context')
    // The server derives the client from the authenticated API key.
    // Sending our cached copy would be a second, forgeable source for the same row.
    expect(pair(options.json, 'client')).toBeUndefined()
  })

  it('omits a blank reply address rather than sending an empty Reply-To', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendReport({ ...report, email: '' })

    expect(sdk.request.mock.calls[0][0].json).not.toHaveProperty('senderEmail')
  })

  it('clamps context values to the bound the collection enforces', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await mutate.sendReport({
      ...report,
      context: { ...context, userAgent: 'U'.repeat(2500), error: 'E'.repeat(2500) },
    })

    // An over-bound value produces a 400 for the WHOLE report.
    // Losing a bug report to a long browser string would be the worst possible trade.
    // `DEFAULT_MAX_VALUE_LENGTH` in SahajCloud's `UserSubmissions/submissionData.ts` is 2000.
    const [options] = sdk.request.mock.calls[0]

    expect(pair(options.json, 'userAgent')).toHaveLength(2000)
    expect(pair(options.json, 'error')).toHaveLength(2000)
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
    await expect(mutate.sendReport(report)).rejects.toBeInstanceOf(UserSubmissionError)
    await expect(mutate.sendReport(report)).rejects.toMatchObject({ code: 'captcha_failed' })
  })

  it.each(['disposable_email', 'urls_not_allowed', 'invalid_email', 'captcha_unavailable'])(
    'carries the %s code through to the caller',
    async (code) => {
      sdk.request.mockRejectedValue(
        new FakeSDKError([{ message: 'Refused.', data: { code } }], 400),
      )

      // Each of these codes routes to its own copy in `ReportIssueForm`'s `REFUSAL_MESSAGE_KEYS`.
      // Losing the code loses the sentence, not the failure.
      await expect(mutate.sendReport(report)).rejects.toMatchObject({ code })
    },
  )

  it('passes an uncoded failure through untouched', async () => {
    const serverError = new FakeSDKError([{ message: 'Something went wrong.' }], 500)

    sdk.request.mockRejectedValue(serverError)

    await expect(mutate.sendReport(report)).rejects.toBe(serverError)
  })

  it('rejects a success body that is not a create envelope, as a parse failure', async () => {
    // The old root endpoint's receipt was `{ ok: true }`.
    // Accepting any 2xx response would put the thank-you screen in front of a sender whose message went nowhere.
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    // This must NOT be a `UserSubmissionError`.
    // A `ZodError`'s `.errors` field is `{ message, code }`, the very shape a refusal body has.
    // So a `.parse()` call inside the request's catch would get re-cast as a server refusal carrying a zod issue code.
    // A bare `.rejects.toThrow()` would pass either way, and would have certified that bug.
    await expect(mutate.sendReport(report)).rejects.toBeInstanceOf(z.ZodError)
    await expect(mutate.sendReport(report)).rejects.not.toBeInstanceOf(UserSubmissionError)
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
