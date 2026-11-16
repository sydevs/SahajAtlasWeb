// @vitest-environment jsdom
//
// What survives when a host REPLACES `<sahaj-atlas>` with a new element, rather than moving it.
//
// A Wix router page re-renders on Back/Forward, which destroys the element and creates another
// one carrying the same configuration. The widget boots at the right route either way, so what
// the swap costs is everything the first element had already read.
//
// jsdom, because the decision is a custom-element lifecycle callback and nothing else reaches
// it: `renderToStaticMarkup` runs no callback at all.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { boot } from '@/Widget'
import atlasAuth from '@/config/api/auth'
import embed, { DEFAULT_EMBED_CONFIG } from '@/config/embed'
import { queryClient } from '@/config/query-client'
import { ELEMENT_NAME } from '@/lib/element'

// jsdom leaves a fresh shadow root with no `adoptedStyleSheets`, so the real adopt throws on a
// property that is Baseline everywhere the widget ships. `styles/sheet.adopt.test.ts` drives that
// seam against a seeded root; here it is noise.
vi.mock('@/styles/sheet', () => ({ adoptStyles: vi.fn() }))

// The tree below the element is not the subject. Mounting it would boot the data layer for a
// decision taken before React renders at all.
vi.mock('@/App', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/App')>()),
  default: () => <p>the app</p>,
}))

const KEY = 'sy-key-one'
const OTHER_KEY = 'sy-key-two'

/** A cache entry no read could reproduce, so a survivor is this entry rather than a refetch. */
const SEEDED = { marker: 'read before the swap' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // Nothing in this lane may reach the network, and the mounted tree warms the atlas config.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in this lane'))),
  )
})

afterEach(() => {
  // The deferred release is the only thing that clears the page-global owner, so letting it run
  // is what returns the module to a state the next case can connect into.
  document.body.innerHTML = ''
  act(() => void vi.runOnlyPendingTimers())

  vi.useRealTimers()
  queryClient.clear()
  atlasAuth.apiKey = null
  embed.config = DEFAULT_EMBED_CONFIG
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Boots the widget the way `auto.js` does, with the key a host's snippet carries. */
function load(key: string) {
  boot({ ...DEFAULT_EMBED_CONFIG, key, map: false })
}

/** Connects one `<sahaj-atlas>`, replacing another atomically where a host would. */
function connect(replacing?: Element) {
  const element = document.createElement(ELEMENT_NAME)

  act(() => {
    if (replacing) replacing.replaceWith(element)
    else document.body.append(element)
  })

  return element
}

describe('a host replacing the element', () => {
  it('keeps the cache and the key when the replacement carries the same key', () => {
    load(KEY)

    const first = connect()

    expect(atlasAuth.apiKey).toBe(KEY)
    queryClient.setQueryData(['geojson'], SEEDED)

    connect(first)

    expect(queryClient.getQueryData(['geojson'])).toBe(SEEDED)
    expect(atlasAuth.apiKey).toBe(KEY)
  })

  it('releases the cache and the key when the replacement carries a different key', () => {
    load(KEY)

    const first = connect()

    queryClient.setQueryData(['geojson'], SEEDED)

    // Only a second loader run can change the key mid-page: it re-reads its own script URL and
    // calls `boot` again.
    load(OTHER_KEY)
    connect(first)

    expect(queryClient.getQueryData(['geojson'])).toBeUndefined()
    // The lazy claim in `AtlasBoot` only fires on a null key, so the new key being in force is
    // what proves the release ran.
    expect(atlasAuth.apiKey).toBe(OTHER_KEY)
  })

  it('still releases once nothing comes back inside the grace window', () => {
    load(KEY)

    const first = connect()

    queryClient.setQueryData(['geojson'], SEEDED)
    act(() => void first.remove())

    expect(queryClient.getQueryData(['geojson'])).toBe(SEEDED)

    act(() => void vi.runOnlyPendingTimers())

    expect(queryClient.getQueryData(['geojson'])).toBeUndefined()
    expect(atlasAuth.apiKey).toBeNull()
  })
})
