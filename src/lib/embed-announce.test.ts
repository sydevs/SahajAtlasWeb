import type { EmbedFingerprint } from '@/loader/detect'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announceEmbed, releaseAnnouncement, resetReportedForTest } from './embed-announce'
import { READY_ATTR } from './readiness'

import { fingerprint } from '@/loader/detect'

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

/** The page the widget is pretending to be mounted on. Read at SEND time, not fixed up front. */
const HOST_PAGE = 'https://sahajayoga.nl/lessons?utm_source=x'

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

/**
 * The host page's URL.
 *
 * A stub rather than a fixture is the whole point of this file since the composition moved: the
 * mount is no longer handed in, it is read from here at the moment of sending — so a case can
 * change the page between calls and see the difference.
 */
function stubLocation(href: string) {
  vi.stubGlobal('location', new URL(href))
  vi.stubGlobal('window', { location: new URL(href) })
}

beforeEach(() => {
  sdk.request.mockReset()
  // Both are module state, so every case starts from a page that has not announced.
  stubDocument()
  stubLocation(HOST_PAGE)
  releaseAnnouncement()
  resetReportedForTest()
  // Node has no `requestIdleCallback`, so without this every case would sit out the real
  // `IDLE_DEADLINE_MS` timer and put seconds on a lane the edit-loop hook runs on every save.
  // The two cases that care about the wait stub it themselves.
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    callback()

    return 0
  })
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

    await announceEmbed({ routing: 'query', observed })

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

    await announceEmbed({ routing: 'query', observed })

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

    await expect(announceEmbed({ routing: 'query', observed })).resolves.toBeUndefined()
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

    await expect(announceEmbed({ routing: 'query', observed })).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    // Names the mount, so the line points at a record rather than at a request.
    expect(String(warn.mock.calls[0])).toContain('https://sahajayoga.nl/lessons')
  })

  it('still publishes the marker when the report is refused', async () => {
    const attributes = stubDocument()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    sdk.request.mockRejectedValue(new FakeSDKError([{ message: 'nope' }], 403))

    await announceEmbed({ routing: 'query', observed })

    expect(attributes.has(READY_ATTR)).toBe(true)
  })

  it('publishes the routing it was handed, not the one the observation carries', async () => {
    const attributes = stubDocument()

    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    // A `routing=path` embed that the widget is in fact query-routing: the report still says what
    // was configured, and the marker — the verifier's evidence — says what the router does.
    const requested = fingerprint(
      { topLevel: true, urlWritable: true, paramPersisted: true },
      'path',
    )

    await announceEmbed({ routing: 'query', observed: requested })

    expect(JSON.parse(attributes.get(READY_ATTR) ?? '')).toMatchObject({ routing: 'query' })
    expect(sdk.request.mock.calls[0][0].json).toMatchObject({ routing: 'path' })
  })

  /**
   * The property the composition move exists for.
   *
   * The mount used to be built by the loader on idle and carried on the boot singleton, so it
   * named whatever page the widget first loaded on — and kept naming it after a host SPA had
   * navigated somewhere else. Reading it at the send site means the report describes the page the
   * widget is actually on when it files.
   */
  it('reports the page it is on when it sends, not the one it loaded on', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    stubLocation('https://sahajayoga.nl/other-page')

    await announceEmbed({ routing: 'query', observed })

    expect(sdk.request.mock.calls[0][0].json).toMatchObject({ pathname: '/other-page' })
  })

  /**
   * The standalone dev entry and every Ladle story mount the widget with no loader behind them.
   * A marker asserting an embed nobody probed is precisely the theatre it exists to prevent.
   */
  it('publishes nothing and sends nothing when no loader observed the page', async () => {
    const attributes = stubDocument()

    await announceEmbed({ routing: 'query', observed: null })

    expect(attributes.size).toBe(0)
    expect(sdk.request).not.toHaveBeenCalled()
  })

  /**
   * The asymmetry the optional mount buys, and the trap in merging these two at all: a page with
   * no mount the endpoint would store — a `blob:` document, an over-long path — still has a widget
   * that booted. Losing the attestation along with the report would take verification away from a
   * page that works.
   */
  it('publishes the marker even when the page has no reportable mount', async () => {
    const attributes = stubDocument()

    stubLocation('blob:https://sahajayoga.nl/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')

    await announceEmbed({ routing: 'query', observed })

    expect(attributes.has(READY_ATTR)).toBe(true)
    expect(sdk.request).not.toHaveBeenCalled()
  })

  /**
   * One POST per page load. The mount effect can run again — a locale change re-renders `Atlas`,
   * and a page builder moving the element remounts it outright — and a duplicate send is a
   * regression nothing else would catch, which is why the flag lives in this module rather than in
   * `Widget.tsx`, where no spec could reach it.
   */
  it('reports once, however many times it is called', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed })
    await announceEmbed({ routing: 'query', observed })
    await announceEmbed({ routing: 'query', observed })

    expect(sdk.request).toHaveBeenCalledTimes(1)
  })

  // The flag must not be spent by a Ladle story or the dev entry, or the first real mount after
  // one would stay silent.
  it('is not spent by a surface with nothing to report', async () => {
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed: null })
    await announceEmbed({ routing: 'query', observed })

    expect(sdk.request).toHaveBeenCalledTimes(1)
  })

  /**
   * The asymmetry between the two halves, and the reason it survives the composition move.
   *
   * The marker is a fresh statement about the widget on screen now, so a re-mounted widget must
   * publish one or a verification that would have passed finds no attestation. The report is
   * bounded instead — one per page load — and that is now a volume decision rather than a
   * correctness one: a re-send would name the page the widget is on, since the mount is read at
   * send time, but a host SPA carrying the widget across routes would file a mount per route
   * against a client's 50-mount cap.
   */
  it('re-publishes the marker after a release but does not re-file the report', async () => {
    const attributes = stubDocument()

    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await announceEmbed({ routing: 'query', observed })
    releaseAnnouncement()

    // The marker cannot outlive the widget it vouches for.
    expect(attributes.has(READY_ATTR)).toBe(false)

    await announceEmbed({ routing: 'query', observed })

    expect(attributes.has(READY_ATTR)).toBe(true)
    expect(sdk.request).toHaveBeenCalledTimes(1)
  })

  /**
   * `void announceEmbed(...)` is how the widget calls this, so anything that rejects is an
   * unhandled rejection in a page we do not own. The wait is the easiest half to leave outside the
   * try, and a host that patched `requestIdleCallback` — consent managers and perf shims do — is
   * what would find it.
   */
  it('survives a host that patched requestIdleCallback into a thrower', async () => {
    vi.stubGlobal('requestIdleCallback', () => {
      throw new Error('patched by a consent manager')
    })
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await expect(announceEmbed({ routing: 'query', observed })).resolves.toBeUndefined()
    expect(sdk.request).toHaveBeenCalledTimes(1)
  })

  // The quieter variant: a shim that accepts the callback and never calls it. Without a deadline
  // running on both paths the promise would hang forever, the flag is already spent, and the
  // report would simply never be sent.
  it('still reports when a patched requestIdleCallback never calls back', async () => {
    vi.stubGlobal('requestIdleCallback', () => undefined)
    sdk.request.mockResolvedValue(jsonResponse({ ok: true, mount: 'x', stored: true }))

    await expect(announceEmbed({ routing: 'query', observed })).resolves.toBeUndefined()
    expect(sdk.request).toHaveBeenCalledTimes(1)
  })
})
