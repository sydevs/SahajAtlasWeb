import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { atlasError } from './report'

/**
 * The Sentry half of the seam (issue #108) — kept in its own file because every case needs
 * a FRESH module registry. `report.ts` memoizes the SDK load for the life of the page, on
 * purpose, so a spec that shared one instance would be asserting against whichever test
 * happened to run first.
 */
const DSN = 'https://publickey@o0.ingest.sentry.io/0'

/**
 * A stand-in for `@sentry/browser`. Mocked at the boundary, per `.claude/rules/tests.md`:
 * what is under test is which failures we hand over and what we let travel with them —
 * never the SDK's own envelope building.
 */
const sdk = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  captured: [] as Array<{ error: unknown; tags: Record<string, unknown> }>,
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
    defaultStackParser: () => [],
    makeFetchTransport: () => ({}),
  }
})

/** A fresh `report.ts` (and the `privacy` singleton it reads) per case. */
async function freshSeam() {
  vi.resetModules()

  const [{ reportInternalError }, { default: privacy }] = await Promise.all([
    import('./report'),
    import('@/config/privacy'),
  ])

  return { reportInternalError, privacy }
}

const logged = vi.fn()

beforeEach(() => {
  sdk.clients = []
  sdk.captured = []
  sdk.failImport = false
  logged.mockClear()
  vi.stubEnv('VITE_SENTRY_DSN', DSN)
  vi.stubGlobal('console', { error: logged, warn: vi.fn() })
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

  it('honours the host opt-out, live, per failure', async () => {
    const { reportInternalError, privacy } = await freshSeam()

    privacy.errorReporting = false
    reportInternalError(atlasError('server', 'upstream fell over'), 'ctx')
    await vi.waitFor(() => expect(logged).toHaveBeenCalledOnce())

    expect(sdk.captured).toHaveLength(0)

    // Flipping it back is honoured without a reload — unlike the Fathom script, nothing
    // has been injected that we cannot take back.
    privacy.errorReporting = true
    reportInternalError(atlasError('server', 'again'), 'ctx')
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(1))
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
    await vi.waitFor(() => expect(logged).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(sdk.captured).toHaveLength(reported ? 1 : 0))

    // Either way the console line is unconditional: a kind we don't send is still the
    // only signal a developer has locally.
    expect(logged).toHaveBeenCalledOnce()
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
})

describe('what is allowed to travel with an event', () => {
  it('collects nothing by default and scrubs what it did not ask for', async () => {
    const { reportInternalError } = await freshSeam()

    reportInternalError(atlasError('server', 'boom'), 'ctx')
    await vi.waitFor(() => expect(sdk.clients).toHaveLength(1))

    const options = sdk.clients[0] ?? {}

    // No default integrations: no global handlers on the HOST's page, no breadcrumbs of
    // their console/clicks/fetches, no `HttpContext` writing their full `location.href`.
    expect(options.integrations).toEqual([])
    expect(options.sendDefaultPii).toBe(false)

    // Two defaults that reach OUT of the widget, pinned because a version bump could
    // reinstate either one silently. `release` otherwise reads `window.SENTRY_RELEASE`
    // — the HOST's global, which would stamp our events with their deploy version — and
    // `sendClientReports` otherwise posts an extra outcome beacon from their page when
    // it is hidden.
    expect(options).toHaveProperty('release', undefined)
    expect(options.sendClientReports).toBe(false)

    const beforeSend = options.beforeSend as (event: Record<string, unknown>) => unknown
    const scrubbed = beforeSend({
      user: { email: 'someone@example.com' },
      breadcrumbs: [{ message: 'clicked' }],
      request: { url: 'https://host.example/classes/london?reset_token=hunter2' },
    }) as { user?: unknown; breadcrumbs?: unknown; request: { url: string } }

    expect(scrubbed.user).toBeUndefined()
    expect(scrubbed.breadcrumbs).toBeUndefined()
    // Origin + path only — the same rule the human report follows. A host's query can
    // carry a reset token and their fragment an OAuth `#access_token`; both are in the
    // fixture above precisely so a regression here fails loudly.
    expect(scrubbed.request.url).toBe('https://host.example/classes/london')
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

    // A second failure must not re-attempt the blocked import — a host whose CSP omits
    // the ingest origin would otherwise get one blocked request per error, forever.
    reportInternalError(atlasError('server', 'again'), 'ctx')
    await vi.waitFor(() => expect(logged).toHaveBeenCalledTimes(2))

    expect(sdk.captured).toHaveLength(0)
    // Two failures, two log lines, and nothing else.
    expect(logged).toHaveBeenCalledTimes(2)
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
