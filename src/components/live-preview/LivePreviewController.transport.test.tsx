// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LivePreviewController } from './LivePreviewController'

import { eventQuery, regionQuery, regionsQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import livePreview, {
  LIVE_PREVIEW_COLLECTION,
  LIVE_PREVIEW_HEADER,
  LIVE_PREVIEW_INACTIVE,
  LIVE_PREVIEW_PATH,
} from '@/config/live-preview/protocol'
import { PREVIEW_EVENT_ID } from '@/lib/live-preview'
import { mockLeafRegion, mockRegionNodes } from '@/mocks/regions'

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
  queryClient.setQueryData(regionsQuery().queryKey, mockRegionNodes)

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

describe('the submission arm (issue #163)', () => {
  const SUBMISSION_ID = '42'

  /** A proposal row as the panel broadcasts it: whole form state, PII included. */
  const proposal = (over: Record<string, unknown> = {}) => ({
    type: 'payload-live-preview',
    collectionSlug: LIVE_PREVIEW_COLLECTION,
    locale: 'fr',
    data: {
      id: Number(SUBMISSION_ID),
      type: 'proposal',
      senderEmail: 'seeker@example.com',
      submissionData: [{ field: 'name', value: 'A Seeker' }],
      screeningResult: { verdict: 'clean' },
      previewEvent: {
        id: 651,
        title: 'Evening Meditation',
        eventType: 'offline',
        languages: ['en'],
        registrationMode: 'sahaj-atlas',
        region: 8000,
        ...over,
      },
    },
  })

  const previewed = () =>
    queryClient.getQueryData(eventQuery(PREVIEW_EVENT_ID, 'fr').queryKey) as
      | Record<string, unknown>
      | undefined

  /** The waiting overlay, by the only thing it puts in the document: the Spinner's status. */
  const skeleton = () => document.querySelector('[role="status"]')

  function mountSubmission() {
    livePreview.id = SUBMISSION_ID
    mount(LIVE_PREVIEW_PATH)
  }

  it('sends no request at all — the populate that would 403 never leaves the browser', async () => {
    // API clients hold create-only on this collection, so there is no request to make. The
    // event arm's spec above asserts the opposite for its own path, which is what makes this
    // a claim about the wiring rather than about an idle component.
    mountSubmission()
    await post(proposal())

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the merged event under the reserved id', async () => {
    mountSubmission()
    await post(proposal())

    expect(previewed()).toMatchObject({ id: PREVIEW_EVENT_ID, title: 'Evening Meditation' })
  })

  it('resolves the region id off the cached tree', async () => {
    mountSubmission()
    await post(proposal())

    expect(previewed()?.region).toMatchObject({ id: 8000, slug: 'cambridgeshire' })
  })

  it('carries none of the submission itself into the cache', async () => {
    mountSubmission()
    await post(proposal())

    expect(JSON.stringify(previewed())).not.toContain('seeker@example.com')
    expect(JSON.stringify(previewed())).not.toContain('screeningResult')
  })

  it('still renders the SECOND edit', async () => {
    // The library caches what the handler returns and addresses the next populate at
    // `<collection>/<that result's id>`. Answering with the merged event directly would
    // re-address message two at the EVENT's id, `namesPreviewedDoc` would refuse it, and
    // live preview would freeze on the first keystroke while every other assertion stayed
    // green.
    mountSubmission()
    await post(proposal())
    await post(proposal({ title: 'Evening Meditation (edited)' }))

    expect(previewed()).toMatchObject({ title: 'Evening Meditation (edited)' })
  })

  it('shows the skeleton until the first message, and not after', async () => {
    // There is no document to fetch, so the ordinary atlas underneath would read as the
    // answer rather than as the wait.
    mountSubmission()

    expect(skeleton()).not.toBeNull()

    await post(proposal())

    expect(skeleton()).toBeNull()
  })

  it('keeps the rendered event when a later message carries no previewEvent', async () => {
    // Putting the skeleton back would drop an opaque overlay over an event the reviewer was
    // reading — and the cache still holds the event either way, so only the screen shows this.
    mountSubmission()
    await post(proposal())
    await post({
      type: 'payload-live-preview',
      collectionSlug: LIVE_PREVIEW_COLLECTION,
      data: { id: Number(SUBMISSION_ID), type: 'proposal' },
    })

    expect(skeleton()).toBeNull()
    expect(previewed()).toMatchObject({ title: 'Evening Meditation' })
  })

  it('keeps it through a message naming another collection', async () => {
    // The producer for the rule above. `mergeData` builds the endpoint from the MESSAGE's slug
    // and our own id, so a message about any other document reaches `namesPreviewedDoc` as
    // `<its slug>/42`, is refused, and comes back as the bare seed — which the library then
    // hands on as the whole of `data`, merging nothing.
    mountSubmission()
    await post(proposal())
    await post({
      type: 'payload-live-preview',
      collectionSlug: 'events',
      data: { id: Number(SUBMISSION_ID), title: 'Another document entirely' },
    })

    expect(skeleton()).toBeNull()
    expect(previewed()).toMatchObject({ title: 'Evening Meditation' })
  })

  it('refuses a proposal message from any origin but the CMS', async () => {
    mountSubmission()
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', { data: proposal(), origin: 'https://evil.example' }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(previewed()).toBeUndefined()
  })
})
