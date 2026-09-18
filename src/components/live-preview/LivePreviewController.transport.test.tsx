// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LivePreviewController } from './LivePreviewController'

import { regionQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import livePreview, {
  LIVE_PREVIEW_HEADER,
  LIVE_PREVIEW_INACTIVE,
} from '@/config/live-preview/protocol'
import { mockLeafRegion } from '@/mocks/regions'

/**
 * The transport, end to end: a `postMessage` from the CMS panel to the request that leaves the
 * browser (issue #40).
 *
 * ⚠ **This has to boot a DOM, and the assertions are the reason.** Everything under test is a
 * `window` listener Payload's own `useLivePreview` installs in an effect, and the properties
 * that matter are all properties of the REQUEST it produces — the depth, the endpoint, the
 * headers. `renderToStaticMarkup` runs no effects, and this component renders nothing anyway,
 * so an SSR spec here could only assert the absence of markup that was never going to exist
 * (`docs/testing.md`).
 *
 * It is also the only place the wiring is observable. `namesPreviewedDoc` has its own pure
 * spec, but a pure spec cannot see whether the hook was handed that predicate, the right depth,
 * or the right origin — the class of defect #132 shipped with four green assertions over a
 * helper nothing called.
 */

const sdk = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), request: vi.fn() }))

vi.mock('@payloadcms/sdk', () => ({
  PayloadSDK: class {
    find = sdk.find
    findByID = sdk.findByID
    request = sdk.request
  },
}))
vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'fr' } }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'fr' }) }))

const SERVER_ORIGIN = new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin
const REGION_PATH = mockLeafRegion.path

const fetchMock = vi.fn()

let queryClient: QueryClient
let cleanup: (() => void) | null = null

/** The document the CMS answers a populate with. Valid `RegionNode` shape, at depth 0. */
const populated = {
  id: mockLeafRegion.id,
  slug: mockLeafRegion.slug,
  name: 'Cambridge (edited)',
  subtitle: 'An unsaved subtitle',
  level: 'city',
  parent: 28,
}

/** What the panel broadcasts on every keystroke. */
const edit = (over: Record<string, unknown> = {}) => ({
  type: 'payload-live-preview',
  collectionSlug: 'regions',
  locale: 'fr',
  data: { id: mockLeafRegion.id, slug: mockLeafRegion.slug, name: 'Cambridge (edited)' },
  ...over,
})

function mount(path: string) {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <LivePreviewController />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  )
  cleanup = () => act(() => root.unmount())
}

/** Posts one message and drains the listener's own promise chain. */
async function post(message: unknown) {
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data: message, origin: SERVER_ORIGIN }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string)
const sentUrl = () => new URL(fetchMock.mock.calls[0][0].toString())
const sentHeaders = () => new Headers(fetchMock.mock.calls[0][1].headers)

beforeEach(() => {
  queryClient = new QueryClient()
  queryClient.setQueryData(regionQuery(mockLeafRegion.slug, 'fr').queryKey, mockLeafRegion)

  fetchMock.mockReset()
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(populated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)

  atlasAuth.apiKey = 'test-key'
  livePreview.active = true
  livePreview.token = 'verified-token'
})

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  atlasAuth.apiKey = null
  Object.assign(livePreview, LIVE_PREVIEW_INACTIVE)
})

describe('the region arm', () => {
  it('populates at depth 0, or RegionNodeSchema rejects the whole document', async () => {
    // `parent` is `z.number().nullish()` — the wholesale-tree shape. At depth 1 the CMS returns
    // it as a populated object, the parse fails, and the overlay drops every live edit in
    // silence. This is the one assertion standing between that and a shipped no-op, and it is
    // asserted HERE because depth is now a prop handed to `useLivePreview`, not an argument to
    // a fetcher of ours.
    mount(REGION_PATH)
    await post(edit())

    expect(sentBody().depth).toBe(0)
  })

  it('addresses the region by the id the drawer already read, not by the slug in the path', async () => {
    mount(REGION_PATH)
    await post(edit())

    expect(sentUrl().pathname).toBe(`/api/regions/${mockLeafRegion.id}`)
  })

  it('carries the edited locale in the body, and the session credential in the headers', async () => {
    mount(REGION_PATH)
    await post(edit())

    expect(sentBody().locale).toBe('fr')
    expect(sentBody().flattenLocales).toBe(false)
    expect(sentHeaders().get(LIVE_PREVIEW_HEADER)).toBe('verified-token')
    expect(sentHeaders().get('Authorization')).toBe('clients API-Key test-key')
    expect(sentHeaders().get('X-Payload-HTTP-Method-Override')).toBe('GET')
    expect(sentUrl().searchParams.get('draft')).toBe('true')
  })

  it('overlays the populated document onto the key the drawer reads', async () => {
    mount(REGION_PATH)
    await post(edit())

    expect(queryClient.getQueryData(regionQuery(mockLeafRegion.slug, 'fr').queryKey)).toMatchObject(
      { name: 'Cambridge (edited)', subtitle: 'An unsaved subtitle' },
    )
  })
})

describe('the endpoint assertion', () => {
  it('refuses an edit to another collection, and sends nothing', async () => {
    // The library merges any message carrying a slug and takes no id at all, so this is the
    // only thing between a sibling document's unsaved edits and this page's cache.
    mount(REGION_PATH)
    await post(edit({ collectionSlug: 'events' }))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves the last good document on screen when it refuses', async () => {
    mount(REGION_PATH)
    await post(edit({ collectionSlug: 'events' }))

    expect(queryClient.getQueryData(regionQuery(mockLeafRegion.slug, 'fr').queryKey)).toMatchObject(
      { name: mockLeafRegion.name, subtitle: mockLeafRegion.subtitle },
    )
  })

  it('refuses a message from any origin but the CMS', async () => {
    mount(REGION_PATH)
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: edit(), origin: 'https://evil.example' }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('a failed populate', () => {
  const cached = () => queryClient.getQueryData(regionQuery(mockLeafRegion.slug, 'fr').queryKey)

  it('keeps the session alive after a refusal, so the next edit still renders', async () => {
    // ⚠ **The screen is not what a missing status check costs.** `mergeData` is
    // `.then((res) => res.json())`, so an `{errors:[…]}` body becomes the document the library
    // caches — and every later edit is then addressed at `regions/undefined`, because an error
    // body has no id. The write-side parse already keeps the refusal off the screen, so
    // asserting only that would pass with no status check at all. What actually breaks is the
    // REST of the session: one 403 and live preview never renders again.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] }), { status: 403 }),
    )
    mount(REGION_PATH)
    await post(edit())

    expect(cached()).toMatchObject({ name: mockLeafRegion.name })

    await post(edit())

    expect(new URL(fetchMock.mock.calls[1][0].toString()).pathname).toBe(
      `/api/regions/${mockLeafRegion.id}`,
    )
    expect(cached()).toMatchObject({ name: 'Cambridge (edited)' })
  })

  it('lets no rejection escape the subscription', async () => {
    // `mergeData` has no try/catch, and the library's own listener is an `async` function whose
    // promise nothing holds. So a dropped connection mid-edit becomes an unhandled rejection —
    // reported to Sentry from a session where nothing is actually wrong.
    const escaped = vi.fn()

    process.on('unhandledRejection', escaped)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    mount(REGION_PATH)
    await post(edit())
    process.off('unhandledRejection', escaped)

    expect(escaped).not.toHaveBeenCalled()
    expect(cached()).toMatchObject({ name: mockLeafRegion.name })
  })
})

describe('the event arm', () => {
  it('populates at depth 1, so its region and images come back as objects', async () => {
    mount('/united-kingdom/cambridgeshire/cambridge/507')
    await post({
      type: 'payload-live-preview',
      collectionSlug: 'events',
      data: { id: 507, title: 'Edited' },
    })

    expect(sentBody().depth).toBe(1)
    expect(sentUrl().pathname).toBe('/api/events/507')
  })
})
