import type { Event } from '@sentry/browser'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { atlasError } from './report'

/**
 * The Sentry half of the seam (issue #108). This is kept in its own file, because
 * every case needs a fresh module registry. `report.ts` memoizes the SDK load
 * and counts events for the life of the page, on purpose, so a spec that
 * shared one instance would be asserting against whichever test happened to
 * run first.
 */
const DSN = 'https://publickey@o0.ingest.sentry.io/0'

/**
 * A stand-in for `@sentry/browser`. This is mocked at the boundary, per
 * `docs/testing.md`. What is under test is which failures we hand over, and
 * what we let travel with them, never the SDK's own envelope building.
 */
const sdk = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  captured: [] as Array<{ error: unknown; tags: Record<string, unknown> }>,
  /** Every `send` the wrapped transport passed through to the real one. */
  sends: [] as unknown[],
  sendFails: false,
  failImport: false,
}))

vi.mock('@sentry/browser', () => {
  if (sdk.failImport) throw new Error('chunk blocked by the host CSP')

  class Scope {
    tags: Record<string, unknown> = {}

    setClient() {}

    clone() {
      const copy = new Scope()

      copy.tags = { ...this.tags }

      return copy
    }

    setTag(key: string, value: unknown) {
      this.tags[key] = value

      return this
    }

    captureException(error: unknown) {
      sdk.captured.push({ error, tags: this.tags })

      return 'event-id'
    }
  }

  return {
    Scope,
    BrowserClient: class {
      constructor(options: Record<string, unknown>) {
        sdk.clients.push(options)
      }

      init() {}
    },
    dedupeIntegration: () => ({ name: 'Dedupe' }),
    linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
    defaultStackParser: () => [],
    makeFetchTransport: () => ({
      send: (envelope: unknown) => {
        sdk.sends.push(envelope)

        return sdk.sendFails ? Promise.reject(new Error('blocked by CSP')) : Promise.resolve({})
      },
      flush: () => Promise.resolve(true),
    }),
  }
})

/** A fresh `report.ts` per case. */
async function freshSeam() {
  vi.resetModules()

  const { reportInternalError, reportIntegrationWarning } = await import('./report')

  return { reportInternalError, reportIntegrationWarning }
}

const logged = vi.fn()
const warned = vi.fn()

beforeEach(() => {
  sdk.clients = []
  sdk.captured = []
  sdk.sends = []
  sdk.sendFails = false
  sdk.failImport = false
  logged.mockClear()
  warned.mockClear()
  vi.stubEnv('VITE_SENTRY_DSN', DSN)
  vi.stubGlobal('console', { error: logged, warn: warned })
  // `hostPageUrl` reads this. The query and fragment are the point of the fixture — see
  // the scrubbing case below.
  vi.stubGlobal('window', {
    location: { href: 'https://host.example/classes/london?reset_token=hunter2#access_token=abc' },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the DSN gate', () => {
  it('never fetches the SDK when no DSN was built in', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')

    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'upstream fell over'), 'ctx')
    await vi.waitFor(() => expect(logged).toHaveBeenCalledOnce())

    // The whole no-DSN promise: exactly today's behaviour, and not one byte fetched.
    expect(sdk.clients).toHaveLength(0)
    expect(sdk.captured).toHaveLength(0)
  })

  // The host opt-out this used to cover is gone (#149). There is no
  // `error-reporting` parameter any more, so the DSN is the only gate, and the
  // case above already pins it. What is worth keeping is that the gate is read
  // per failure, instead of once at module load. That is what would let a
  // future veto take effect without a reload, and it is a property of
  // `reportingDsn()` that nothing else asserts.
  it('reads the gate per failure rather than caching it at module load', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'upstream fell over'), 'ctx')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(1))

    reportInternalError(atlasError('server', 'again'), 'ctx')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(2))
  })
})

describe('which failures are worth an event', () => {
  it.each([
    ['server', true],
    ['config', true],
    ['unknown', true],
    ['offline', false],
    ['not-found', false],
  ] as const)('%s → reported: %s', async (kind, reported) => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError(kind, `a ${kind} failure`), 'ctx')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(reported ? 1 : 0))

    // The console line is unconditional, but its level follows the same table.
    // The host's console must not get a red error for something we have
    // already called not a malfunction.
    expect(logged).toHaveBeenCalledTimes(reported ? 1 : 0)
    expect(warned).toHaveBeenCalledTimes(reported ? 0 : 1)
  })

  it('tags the event with the classified kind and the boundary that caught it', async () => {
    const { reportInternalError } = await freshSeam()
    const error = atlasError('config', 'Missing api key.')

    reportInternalError(error, 'app')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(1))

    expect(sdk.captured[0]?.error).toBe(error)
    expect(sdk.captured[0]?.tags).toEqual({ 'atlas.kind': 'config', 'atlas.context': 'app' })
  })

  it('gives each event its own tags rather than the previous one’s', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('config', 'first'), 'app')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(1))
    reportInternalError(atlasError('server', 'second'), 'view boundary')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(2))

    expect(sdk.captured[1]?.tags).toEqual({
      'atlas.kind': 'server',
      'atlas.context': 'view boundary',
    })
    // One client for both: the load is memoized for the life of the page.
    expect(sdk.clients).toHaveLength(1)
  })

  it('stops at a hard ceiling per page load', async () => {
    const { reportInternalError } = await freshSeam()

    // `Link` reports from a render body, so a malformed href in a long list is
    // one call per row per render. Dedupe collapses identical repeats. This
    // is the absolute bound for everything else.
    for (let i = 0; i < 40; i += 1) {
      reportInternalError(atlasError('unknown', `failure ${i}`), 'ctx')
    }

    await vi.waitFor(() => expect(sdk.captured).toHaveLength(10))
    // Every one of them still reached the developer's console — the cap is about what
    // leaves the visitor's browser, not about hiding anything locally.
    expect(logged).toHaveBeenCalledTimes(40)
  })
})

describe('what is allowed to travel with an event', () => {
  it('chooses two pure integrations and declines everything that reaches out', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'boom'), 'ctx')
    await vi.waitFor(() => expect(sdk.clients).toHaveLength(1))

    const options = sdk.clients[0] ?? {}

    // Dedupe (the render-body callers) and LinkedErrors (`error.cause` chains) only —
    // both pure event processors. Nothing that hooks the host page.
    expect((options.integrations as Array<{ name: string }>).map((i) => i.name)).toEqual([
      'Dedupe',
      'LinkedErrors',
    ])
    expect(options.sendDefaultPii).toBe(false)
    expect(options.maxValueLength).toBe(500)

    // Two defaults that reach outside the widget, pinned because a version
    // bump could reinstate either one silently. `release` otherwise reads
    // `window.SENTRY_RELEASE`, the host's global, which would stamp our
    // events with their deploy version. `sendClientReports` otherwise posts
    // an extra outcome beacon from their page.
    expect(options).toHaveProperty('release', undefined)
    expect(options.sendClientReports).toBe(false)
  })

  it('rebuilds the event from an allowlist rather than trimming it', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'boom'), 'ctx')
    await vi.waitFor(() => expect(sdk.clients).toHaveLength(1))

    const beforeSend = sdk.clients[0]?.beforeSend as (
      event: Record<string, unknown>,
      hint: Record<string, unknown>,
    ) => Record<string, unknown>

    // Everything a HOST could have put on the shared global scope — the carrier is keyed
    // by SDK version, so a page running this same version shares it with us.
    const hint = { attachments: [{ filename: 'host-secrets.txt' }] }
    const scrubbed = beforeSend(
      {
        tags: { 'atlas.kind': 'server', 'atlas.context': 'ctx', hostTenant: 'acme-corp' },
        user: { email: 'someone@example.com' },
        extra: { thrownObject: { password: 'hunter2' } },
        contexts: { hostSession: { id: 'abc' } },
        breadcrumbs: [{ message: 'clicked' }],
        request: { url: 'https://host.example/classes/london?reset_token=hunter2' },
      },
      hint,
    )

    expect(scrubbed.tags).toEqual({ 'atlas.kind': 'server', 'atlas.context': 'ctx' })
    expect(scrubbed.user).toBeUndefined()
    expect(scrubbed.extra).toBeUndefined()
    expect(scrubbed.contexts).toBeUndefined()
    expect(scrubbed.breadcrumbs).toBeUndefined()
    // Attachments are appended after this hook, so clearing the hint is the only way.
    expect(hint.attachments).toEqual([])
    // Origin plus path only: the same rule the human report follows. A host's
    // query can carry a reset token, and their fragment an OAuth
    // `#access_token`. Both are in the fixture above, precisely so a
    // regression here fails loudly.
    expect((scrubbed.request as { url: string }).url).toBe('https://host.example/classes/london')
  })

  // The one field the scrub must not take (#130). `prepareEvent` fills
  // `debug_meta` from the debug IDs the bundler plugin injected into each
  // chunk, and it does so before this hook runs. So dropping it here would
  // leave every production frame pointing into a minified chunk, with the
  // upload, the deletion gate, and the whole ticket still green. The hook
  // survives on being a delete-list. The docblock beside it says "allowlist",
  // and the day someone makes that literally true is the day this spec has
  // to fail.
  it('keeps debug_meta, without which the uploaded source maps cannot be matched', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'boom'), 'ctx')
    await vi.waitFor(() => expect(sdk.clients).toHaveLength(1))

    const beforeSend = sdk.clients[0]?.beforeSend as (
      event: Record<string, unknown>,
      hint: Record<string, unknown>,
    ) => Record<string, unknown>

    // **This is typed against the SDK's own `Event`, which is the half that
    // makes this a real assertion.** A delete-list scrub returns any key you
    // hand it, so a fixture invented here would pass even if `debug_meta`
    // were misspelled, or the SDK had renamed it. The spec would then be
    // pinning a field nothing produces. Binding the fixture to
    // `Event['debug_meta']` means a rename or a shape change fails
    // `pnpm typecheck`.
    //
    // Driving the real `applyDebugIds`/`applyDebugMeta` would be stronger
    // still, and this is deliberately not done. They are not public API
    // (`@sentry/core`'s `exports` map offers only `.`, `./server`, and
    // `./browser`), so reaching them means a deep import into
    // `build/esm/utils/`, which is exactly the library-internals coupling
    // `docs/testing.md` rules out. This is the strongest form available at
    // the seam.
    const debugMeta: NonNullable<Event['debug_meta']> = {
      images: [
        {
          type: 'sourcemap',
          code_file: 'https://sahajatlas.pages.dev/assets/App-C5ZV2wC2.js',
          debug_id: '7f3a1c60-9b2e-4d51-8a44-0c1d2e3f4a5b',
        },
      ],
    }

    const scrubbed = beforeSend({ debug_meta: debugMeta }, {})

    expect(scrubbed.debug_meta).toEqual(debugMeta)
  })
})

describe('a host whose CSP blocks the ingest origin', () => {
  it('stops sending after the first refusal instead of once per failure', async () => {
    // The chunk itself loads fine. It comes from our own origin under
    // `script-src`, which the host already allows because they loaded the
    // widget. What CSP blocks is the transport POST. Sentry's own transport
    // never learns from that. It records an outcome and rethrows, and the
    // only back-off it keeps comes from a rate-limit header on a response,
    // which a blocked request never produces. Hence the latch.
    sdk.sendFails = true

    const { reportInternalError } = await freshSeam()
    const options = await vi.waitFor(async () => {
      reportInternalError(atlasError('server', 'boom'), 'ctx')
      await vi.waitFor(() => expect(sdk.clients).toHaveLength(1))

      return sdk.clients[0] ?? {}
    })

    const transport = (
      options.transport as (o: unknown) => { send: (e: unknown) => Promise<unknown> }
    )({})

    await expect(transport.send('envelope-1')).resolves.toEqual({})
    await expect(transport.send('envelope-2')).resolves.toEqual({})
    await expect(transport.send('envelope-3')).resolves.toEqual({})

    // One blocked request for the life of the page, not one per reported failure — which
    // is what the README promises an integrator who declines the origin.
    expect(sdk.sends).toHaveLength(1)
  })
})

describe('the never-throws contract', () => {
  it('swallows an SDK that cannot be fetched, and adds no console noise', async () => {
    sdk.failImport = true

    const { reportInternalError } = await freshSeam()

    // This runs inside an error fallback: a throw here blanks the widget on someone
    // else's page, and an uncaught rejection is noise in their console.
    expect(() => reportInternalError(atlasError('server', 'boom'), 'ctx')).not.toThrow()
    await vi.waitFor(() => expect(logged).toHaveBeenCalledOnce())

    // A second failure must not re-attempt the blocked import.
    reportInternalError(atlasError('server', 'again'), 'ctx')
    await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(2))

    expect(sdk.captured).toHaveLength(0)
    // Two failures, two log lines, and nothing else.
    expect(warned).not.toHaveBeenCalled()
  })

  it('swallows a capture that throws', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'first'), 'ctx')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(1))

    const exploding = vi.spyOn(sdk.captured, 'push').mockImplementation(() => {
      throw new Error('transport exploded')
    })

    expect(() => reportInternalError(atlasError('server', 'second'), 'ctx')).not.toThrow()
    await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(2))

    exploding.mockRestore()
  })
})

describe('reportIntegrationWarning', () => {
  it('stays console-only — it fires before the host has been asked', async () => {
    const { reportIntegrationWarning } = await freshSeam()

    // A 20-line documented decision deserves one assertion. Both call sites
    // run from the custom-element lifecycle, potentially before the loader's
    // configuration has been read. So a beacon here could outrun
    // `error-reporting="false"`.
    reportIntegrationWarning('the embed script is on this page twice.')
    await vi.waitFor(() => expect(warned).toHaveBeenCalledOnce())

    expect(sdk.clients).toHaveLength(0)
    expect(sdk.captured).toHaveLength(0)
  })
})
