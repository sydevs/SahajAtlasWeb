// @vitest-environment jsdom
//
// What a `routing=path` embed shows when the client record cannot be read, and what the way
// out of it does. jsdom, because the whole property is a re-render: the screen a boundary
// renders, and whether its retry reaches the query behind it. `renderToStaticMarkup` runs
// neither, and the earlier version of this boundary degraded silently — a path embed that
// dropped to query routing renders perfectly well, which is why every gate stayed green
// through two separate defects here (see the comments in `Widget.tsx`).
//
// Deliberately no @testing-library/react, like `views/reset-boundary.test.tsx`: React 18.3
// exports `act`, and `createRoot` is all this needs.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Widget from '@/Widget'
import atlasAuth from '@/config/api/auth'
import embed, { DEFAULT_EMBED_CONFIG } from '@/config/embed'
import { queryClient } from '@/config/query-client'
import { atlasError } from '@/lib/report'

// The record read, at the one seam both reads of it share (`config/api/index.ts`). Mocking
// the contract rather than the transport is what keeps the key identical to the one
// `AppShell` would read back out of the cache.
const getClient = vi.hoisted(() => vi.fn())

vi.mock('@/config/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/api')>()),
  clientQuery: (apiKey?: string | null) => ({
    queryKey: ['client', apiKey] as const,
    queryFn: getClient,
  }),
}))

// The atlas DOES offer a report form here. Left to the real gate, a `fetch` that rejects
// answers "no form", and the no-report-action case below would pass for that reason instead of
// for the surface limit it exists to pin.
vi.mock('@/hooks/use-report-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-report-form')>()),
  useReportForm: () => ({ formId: 7, enabled: true }),
}))

// `RootBoundary` stays real — it is the screen these cases must NOT reach. Only the app
// below it is stubbed, so the degrade arm is observable without mounting the whole tree.
vi.mock('@/App', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/App')>()),
  default: () => <p>the app</p>,
}))

const LAST_RUNG = 'This content could not be loaded'
const SERVER_MESSAGE = 'Our servers are having trouble right now.'

let container: HTMLDivElement

// React's development build re-throws a caught error through a synthetic `error` event. Every
// case here throws on purpose, so this keeps a passing run readable.
const muteExpectedThrow = (event: ErrorEvent) => event.preventDefault()

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  window.addEventListener('error', muteExpectedThrow)
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // Nothing in the unit lane may reach the network, and the surfaces under test read the
  // atlas config for their report gate and warm the translations on mount.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in this lane'))),
  )

  // The real client retries a `server` failure once, on a jittered backoff — correct in a
  // browser, and a spinner these assertions would race. This is the retry under test being
  // the viewer's press, not the retryer's.
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: 0, staleTime: 0 } })

  atlasAuth.apiKey = null
  embed.config = { ...DEFAULT_EMBED_CONFIG, key: 'sy-test-key', map: false, routing: 'path' }
})

afterEach(() => {
  window.removeEventListener('error', muteExpectedThrow)
  container.remove()
  queryClient.clear()
  atlasAuth.apiKey = null
  embed.config = DEFAULT_EMBED_CONFIG
  getClient.mockReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Renders the widget and lets the record read settle. */
const mount = async () => {
  const root = createRoot(container)

  await act(async () => {
    root.render(<Widget />)
  })

  return root
}

const press = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === label)

  expect(button).toBeTruthy()

  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('a path embed whose client record cannot be read', () => {
  it('reaches the localized screen, not the last rung, on a server failure', async () => {
    getClient.mockRejectedValue(atlasError('server', 'clients/me 503'))

    const root = await mount()

    expect(container.textContent).toContain(SERVER_MESSAGE)
    expect(container.textContent).not.toContain(LAST_RUNG)
    // The degrade arm is the other thing this must not do: query routing under a path
    // prefix is what wrote `?atlas=` URLs below it.
    expect(container.textContent).not.toContain('the app')

    await act(async () => root.unmount())
  })

  it('re-reads the record when the visitor retries', async () => {
    getClient.mockRejectedValue(atlasError('server', 'clients/me 503'))

    const root = await mount()

    expect(getClient).toHaveBeenCalledTimes(1)

    // Still failing, so the screen stays. What the press has to prove is that the read ran
    // again: without `ResetErrorBoundary`'s `QueryErrorResetBoundary` the boundary clears
    // and the remounted read re-throws React Query's cached rejection, calling nothing.
    await press('Try again')

    expect(getClient).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain(SERVER_MESSAGE)

    await act(async () => root.unmount())
  })

  it('offers no report action, since this surface mounts above the modal host', async () => {
    getClient.mockRejectedValue(atlasError('server', 'clients/me 503'))

    const root = await mount()

    expect(container.textContent).toContain(SERVER_MESSAGE)
    expect(container.textContent).not.toContain('Report an issue')

    await act(async () => root.unmount())
  })

  it('still degrades a refused key to query routing', async () => {
    getClient.mockRejectedValue(atlasError('config', 'clients/me 403'))

    const root = await mount()

    expect(container.textContent).toContain('the app')
    expect(container.textContent).not.toContain(SERVER_MESSAGE)
    expect(container.textContent).not.toContain(LAST_RUNG)

    await act(async () => root.unmount())
  })
})
