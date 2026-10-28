import type { ReportContext } from '@/lib/report'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import z from 'zod'

import { UserSubmissionError } from './mutate'
import proposalApi from './proposal'

// The same boundary mock as `mutate.test.ts`: the SDK is stubbed, so `requestJson` runs against a
// controlled Response.
const sdk = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), request: vi.fn() }))

vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = sdk.find
    findByID = sdk.findByID
    request = sdk.request
  },
}))

const jsonResponse = (data: unknown) => ({ json: async () => data })

/** What the SDK throws on a non-2xx: the response body's `errors` array, verbatim. */
class FakeSDKError extends Error {
  constructor(
    readonly errors: { message?: string; code?: string; data?: { code?: string } }[],
    readonly status: number,
  ) {
    super(errors[0]?.message ?? 'Request failed')
  }
}

/** One `submissionData` pair, read back out of a sent body by its key. */
const pair = (json: { submissionData: { field: string; value: string }[] }, field: string) =>
  json.submissionData.find((entry) => entry.field === field)?.value

const context: ReportContext = {
  path: '/india/pune/e/42',
  pageUrl: 'https://host.example/find-a-class',
  locale: 'en',
  client: 'Sahaja Yoga UK',
  userAgent: 'Mozilla/5.0 (Macintosh)',
}

beforeEach(() => {
  sdk.request.mockReset()
})

describe('sendProposal', () => {
  const created = { doc: { id: 99 }, message: 'Created successfully.' }

  // A new in-person listing, as the add-a-class flow builds it from a picked address.
  const newListing = {
    proposed: {
      eventType: 'offline' as const,
      address: {
        mapboxId: 'dXJuOm1ieGFkcjoxMjM0',
        street: '10 Downing Street',
        city: 'London',
        country: 'GB',
        latitude: 51.5034,
        longitude: -0.1276,
      },
      schedule: { firstDate: '2026-11-03T19:00:00.000Z', firstDate_tz: 'Europe/London' as const },
    },
    location: {
      placeId: 'dXJuOm1ieHBsYzpBUVRC',
      regionId: 'dXJuOm1ieHBsYzpBVFk=',
      countryId: 'dXJuOm1ieHBsYzpJdTA',
    },
    senderEmail: 'ada@example.org',
    note: 'I run this class.',
    turnstileToken: 'tok-1',
    context,
  }

  it('creates a proposal row carrying the patch, the location and the sender', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await expect(proposalApi.sendProposal(newListing)).resolves.toEqual({ doc: { id: 99 } })

    const [options] = sdk.request.mock.calls[0]

    expect(options.method).toBe('POST')
    expect(options.path).toBe('/user-submissions')
    expect(options.json.type).toBe('proposal')
    expect(options.json.senderEmail).toBe('ada@example.org')
    // The address's own id rides in the Events address group; the layers above it in
    // `location`, which intake matches to a region.
    expect(options.json.proposed.address.mapboxId).toBe('dXJuOm1ieGFkcjoxMjM0')
    expect(options.json.location).toEqual(newListing.location)
    // A new listing names no event, and a proposal names no form — only contact and subscribe do.
    expect(options.json).not.toHaveProperty('event')
    expect(options.json).not.toHaveProperty('form')
  })

  it('never sends region or regionHint, which intake derives itself', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await proposalApi.sendProposal({
      ...newListing,
      // A caller that slipped either in would mint a listing in a region of its choosing.
      proposed: { ...newListing.proposed, region: 7, images: [3] } as typeof newListing.proposed,
    })

    const [options] = sdk.request.mock.calls[0]

    expect(options.json).not.toHaveProperty('region')
    expect(options.json).not.toHaveProperty('regionHint')
    expect(options.json.proposed).not.toHaveProperty('region')
    expect(options.json.proposed).not.toHaveProperty('images')
  })

  it('sends only proposable Events fields, so `proposed_field_invalid` is unreachable', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await proposalApi.sendProposal({
      ...newListing,
      proposed: {
        ...newListing.proposed,
        manager: 1,
        registrationMode: 'external',
        externalRegistrationUrl: 'https://phish.example',
        verificationStage: 'verified',
      } as typeof newListing.proposed,
    })

    expect(Object.keys(sdk.request.mock.calls[0][0].json.proposed).sort()).toEqual([
      'address',
      'eventType',
      'schedule',
    ])
  })

  it('puts an online class city in location.placeId', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await proposalApi.sendProposal({
      ...newListing,
      proposed: { eventType: 'online', onlineUrl: 'https://meet.example/abc' },
      location: { placeId: 'dXJuOm1ieHBsYzpBUVRC' },
    })

    const [options] = sdk.request.mock.calls[0]

    expect(options.json.location).toEqual({ placeId: 'dXJuOm1ieHBsYzpBUVRC' })
    expect(options.json.proposed).not.toHaveProperty('address')
  })

  it('drops a location id the column would refuse, and omits an empty location', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await proposalApi.sendProposal({
      ...newListing,
      location: { placeId: 'not an id!', regionId: 'x'.repeat(201), countryId: undefined },
    })

    // One malformed id refuses the whole create at the column's schema.
    expect(sdk.request.mock.calls[0][0].json).not.toHaveProperty('location')
  })

  it('names the event for a correction', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await proposalApi.sendProposal({
      event: 507,
      proposed: { contactPhone: '+44 20 7946 0000', address: { room: 'Hall B' } },
      senderEmail: 'ada@example.org',
      turnstileToken: 'tok-1',
      context,
    })

    const [options] = sdk.request.mock.calls[0]

    expect(options.json.event).toBe(507)
    expect(options.json.proposed).toEqual({
      contactPhone: '+44 20 7946 0000',
      address: { room: 'Hall B' },
    })
    expect(options.json).not.toHaveProperty('location')
  })

  it('carries the note and the context as allowed pairs, and the token as a header', async () => {
    sdk.request.mockResolvedValue(jsonResponse(created))

    await proposalApi.sendProposal(newListing)

    const [options] = sdk.request.mock.calls[0]

    expect(pair(options.json, 'note')).toBe('I run this class.')
    expect(pair(options.json, 'hostUrl')).toBe('https://host.example/find-a-class')
    expect(pair(options.json, 'path')).toBe('/india/pune/e/42')
    expect(pair(options.json, 'locale')).toBe('en')
    expect(pair(options.json, 'userAgent')).toBe('Mozilla/5.0 (Macintosh)')
    // `proposal` allows only the base keys plus `note`; anything else is a 400.
    const allowed = ['name', 'locale', 'path', 'hostUrl', 'userAgent', 'error', 'note']

    for (const { field } of options.json.submissionData) expect(allowed).toContain(field)
    expect(options.init.headers['x-turnstile-token']).toBe('tok-1')
    expect(JSON.stringify(options.json)).not.toContain('tok-1')
  })

  it.each([
    'captcha_failed',
    'captcha_unavailable',
    'invalid_email',
    'disposable_email',
    'urls_not_allowed',
    'content_unscannable',
  ])('re-casts a %s refusal as a UserSubmissionError', async (code) => {
    sdk.request.mockRejectedValue(new FakeSDKError([{ message: 'Refused.', data: { code } }], 400))

    await expect(proposalApi.sendProposal(newListing)).rejects.toBeInstanceOf(UserSubmissionError)
    await expect(proposalApi.sendProposal(newListing)).rejects.toMatchObject({ code })
  })

  it('rejects a success body that is not a create envelope, as a parse failure', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true }))

    await expect(proposalApi.sendProposal(newListing)).rejects.toBeInstanceOf(z.ZodError)
  })
})
