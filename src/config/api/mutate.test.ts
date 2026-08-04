import { describe, it, expect, vi, beforeEach } from 'vitest'

import mutate, { RegistrationRefusedError } from './mutate'

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
