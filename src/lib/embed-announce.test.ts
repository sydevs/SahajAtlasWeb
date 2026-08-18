import type { EmbedFingerprint } from '@/loader/detect'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announceEmbed, releaseAnnouncement } from './embed-announce'
import { READY_ATTR } from './readiness'

import { fingerprint } from '@/loader/detect'
import { buildReport } from '@/loader/report'

// The same boundary mock as `config/api/mutate.test.ts`: the SDK is stubbed so the real
// `reportEmbed` runs against a controlled Response, and i18n is stubbed so importing the client
// doesn't boot the real HTTP backend. Mocking our own `api` instead would defeat the point —
// what this file exists to prove is that the send is WIRED, not that a spy can be called.
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
    readonly errors: { message?: string }[],
    readonly status: number,
  ) {
    super(errors[0]?.message ?? 'Request failed')
  }
}

const observed: EmbedFingerprint = fingerprint(
  { topLevel: true, urlWritable: true, paramPersisted: true },
  'query',
)

const report = buildReport(observed, 'https://sahajayoga.nl/lessons?utm_source=x') ?? null

/** The smallest `documentElement` the marker touches — the node lane has no DOM. */
function stubDocument() {
  const attributes = new Map<string, string>()

  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
    },
  })

  return attributes
}

beforeEach(() => {
  sdk.request.mockReset()
  // The once-flag is module state, so every case starts from a page that has not announced.
  stubDocument()
  releaseAnnouncement()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('announceEmbed', () => {
  it('posts the report to the endpoint that receives it', async () => {
    const attributes = stubDocument()

    sdk.request.mockResolvedValue(
      jsonResponse({ ok: true, mount: 'https://sahajayoga.nl/lessons', stored: true }),
    )

    await announceEmbed({ routing: 'query', observed, report })

    expect(sdk.request).toHaveBeenCalledTimes(1)
    expect(sdk.request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      path: '/clients/report',
    })
    expect(attributes.get(READY_ATTR)).toBeDefined()
  })

  // The four field names are SahajCloud's, validated by its Zod schema — a mismatch is a 400 on
  // every send, which is exactly what this shipped with before #153.
  it('sends the mount split in two, and the endpoint spelling of the mode', async () => {
    stubDocument()
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed, report })

    expect(sdk.request.mock.calls[0][0].json).toMatchObject({
      origin: 'https://sahajayoga.nl',
      pathname: '/lessons',
      mode: 'inline',
      routing: 'query',
      topLevel: true,
      urlWritable: true,
      paramPersisted: true,
    })
  })

  // `stored: false` means the server already held this observation and suppressed the write —
  // which is how reporting on every mount stays cheap, and is a success, not a refusal.
  it('treats a suppressed duplicate as a successful send', async () => {
    stubDocument()
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: false }))

    await expect(announceEmbed({ routing: 'query', observed, report })).resolves.toBeUndefined()
  })

  /**
   * The guarantee this module exists for, and the one a pure test of the pieces cannot see: a
   * `.catch` that was never attached looks exactly like one that was. Both refusals name something
   * a person has to fix — 403 an origin outside `allowedDomains` (or no allowlist at all, which
   * this endpoint refuses rather than reading as allow-all), 429 the 50-mount cap — and neither is
   * allowed to become an exception in somebody else's page.
   */
  it.each([
    [403, 'This origin is not allowed for this API client.'],
    [429, 'This client already tracks 50 embed mounts, the maximum.'],
    [500, 'Could not record this report.'],
  ])('turns a %i into a console diagnostic rather than a throw', async (status, message) => {
    stubDocument()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    sdk.request.mockRejectedValue(new FakeSDKError([{ message }], status))

    await expect(announceEmbed({ routing: 'query', observed, report })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    // Names the mount, so the line points at a record rather than at a request.
    expect(String(warn.mock.calls[0])).toContain('https://sahajayoga.nl/lessons')
  })

  it('still publishes the marker when the report is refused', async () => {
    const attributes = stubDocument()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    sdk.request.mockRejectedValue(new FakeSDKError([{ message: 'nope' }], 403))

    await announceEmbed({ routing: 'query', observed, report })

    expect(attributes.has(READY_ATTR)).toBe(true)
  })

  it('publishes the routing it was handed, not the one the report carries', async () => {
    const attributes = stubDocument()

    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    // A `routing=path` embed that the widget is in fact query-routing: the report still says what
    // was configured, and the marker — the verifier's evidence — says what the router does.
    const requested = fingerprint(
      { topLevel: true, urlWritable: true, paramPersisted: true },
      'path',
    )

    await announceEmbed({
      routing: 'query',
      observed: requested,
      report: buildReport(requested, 'https://site.com/') ?? null,
    })

    expect(JSON.parse(attributes.get(READY_ATTR) ?? '')).toMatchObject({ routing: 'query' })
    expect(sdk.request.mock.calls[0][0].json).toMatchObject({ routing: 'path' })
  })

  /**
   * The standalone dev entry and every Ladle story mount the widget with no loader behind them.
   * A marker asserting an embed nobody probed is precisely the theatre it exists to prevent.
   */
  it('publishes nothing and sends nothing when no loader observed the page', async () => {
    const attributes = stubDocument()

    await announceEmbed({ routing: 'query', observed: null, report: null })

    expect(attributes.size).toBe(0)
    expect(sdk.request).not.toHaveBeenCalled()
  })

  // A page whose URL would not parse has no mount to file, but the widget did still boot — so the
  // attestation stands on its own.
  it('publishes the marker even when there is no mount to report', async () => {
    const attributes = stubDocument()

    await announceEmbed({ routing: 'query', observed, report: null })

    expect(attributes.has(READY_ATTR)).toBe(true)
    expect(sdk.request).not.toHaveBeenCalled()
  })

  /**
   * One marker and one POST per page. The widget's mount effect can run again — a locale change
   * re-renders `Atlas`, and a page builder moving the element remounts it outright — and a
   * duplicate send is a regression nothing else would catch, which is why the flag lives in this
   * module rather than in `Widget.tsx`, where no spec could reach it.
   */
  it('announces once, however many times it is called', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed, report })
    await announceEmbed({ routing: 'query', observed, report })
    await announceEmbed({ routing: 'query', observed, report })

    expect(sdk.request).toHaveBeenCalledTimes(1)
  })

  // A surface that announced nothing has not announced: the flag must not be spent by a Ladle
  // story or the dev entry, or the first real mount after one would stay silent.
  it('is not spent by a surface with nothing to announce', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed: null, report: null })
    await announceEmbed({ routing: 'query', observed, report })

    expect(sdk.request).toHaveBeenCalledTimes(1)
  })

  it('lets the next element announce for itself once ownership is released', async () => {
    const attributes = stubDocument()

    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed, report })
    releaseAnnouncement()

    // The marker cannot outlive the widget it vouches for.
    expect(attributes.has(READY_ATTR)).toBe(false)

    await announceEmbed({ routing: 'query', observed, report })

    expect(sdk.request).toHaveBeenCalledTimes(2)
    expect(attributes.has(READY_ATTR)).toBe(true)
  })
})
