// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LivePreviewController } from './LivePreviewController'

import { regionQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import livePreview, { LIVE_PREVIEW_INACTIVE } from '@/config/live-preview/protocol'
import { mockLeafRegion } from '@/mocks/regions'

/**
 * Which restraints a session installs, by what it is previewing (issue #211).
 *
 * ⚠ **jsdom, because the link guard IS a capture-phase `window` listener.** What it does is
 * cancel a click, and `renderToStaticMarkup` runs no effects and dispatches no events, so the
 * node lane could only assert the absence of markup this component never renders anyway
 * (`docs/testing.md`).
 *
 * The scoped cases mount on the SAME path as the document ones, so the session's `scope` is the
 * only thing that differs between them.
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

/** Clicks a real anchor and reports whether the guard cancelled it. */
function clickAnchor(href: string): boolean {
  const anchor = document.createElement('a')

  anchor.setAttribute('href', href)
  document.body.append(anchor)

  const click = new MouseEvent('click', { bubbles: true, cancelable: true })

  anchor.dispatchEvent(click)

  return click.defaultPrevented
}

const pinned = () => queryClient.getQueryDefaults(['event']).staleTime

/** One keystroke from the CMS panel, plus the listener's own promise chain. */
async function postEdit() {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: SERVER_ORIGIN,
        data: {
          type: 'payload-live-preview',
          collectionSlug: 'regions',
          locale: 'fr',
          data: { id: mockLeafRegion.id, name: 'Cambridge (edited)' },
        },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

beforeEach(() => {
  queryClient = new QueryClient()
  // The arm addresses its populate by the id the drawer already read, so without this there is
  // no request to observe in either session and both halves pass for the wrong reason.
  queryClient.setQueryData(regionQuery(mockLeafRegion.slug, 'fr').queryKey, mockLeafRegion)

  fetchMock.mockReset()
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ id: mockLeafRegion.id }), {
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

describe('a document session', () => {
  it('inerts every link but a same-page hash', () => {
    mount(REGION_PATH)

    expect(clickAnchor('/india/pune/507')).toBe(true)
    expect(clickAnchor('#agenda')).toBe(false)
  })

  it('pins the drawer queries a live edit is overlaid onto', () => {
    mount(REGION_PATH)

    expect(pinned()).toBe(Infinity)
    expect(queryClient.getQueryDefaults(['region']).staleTime).toBe(Infinity)
  })

  it('still mounts the arm that populates the edit', async () => {
    mount(REGION_PATH)
    await postEdit()

    expect(fetchMock).toHaveBeenCalled()
  })
})

describe('a translations session', () => {
  beforeEach(() => {
    livePreview.scope = 'sy-atlas-translations'
  })

  it('leaves every link live, so the translator can reach the screen their string is on', () => {
    // The panel opens at the atlas root, which is where every one of those clicks starts.
    mount('/')

    expect(clickAnchor('/india/pune/507')).toBe(false)
    expect(clickAnchor('/search')).toBe(false)
  })

  it('leaves them live on a document path too — the scope decides, not the route', () => {
    mount(REGION_PATH)

    expect(clickAnchor('/india/pune/507')).toBe(false)
  })

  it('pins no query defaults, because it overlays no document', () => {
    mount(REGION_PATH)

    expect(pinned()).toBeUndefined()
    expect(queryClient.getQueryDefaults(['region']).staleTime).toBeUndefined()
  })

  it('mounts no document arm, so nothing snaps navigation back either', async () => {
    // The route lock lives inside the arms, and a scoped session resolving a target would take
    // the links back by a second door, having just been let through the first. Both arms render
    // `null`, so the only thing that observes one is the populate request it makes — which is
    // why the document session above has to make it for this to mean anything.
    mount(REGION_PATH)
    await postEdit()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
