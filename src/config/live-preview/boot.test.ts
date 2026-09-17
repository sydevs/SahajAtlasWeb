// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  activateLivePreview,
  captureLivePreview,
  readLivePreviewParams,
  stripLivePreviewToken,
} from './boot'
import livePreview, { LIVE_PREVIEW_INACTIVE } from './protocol'

/**
 * The boot half of live preview: what a URL may switch on, and when.
 *
 * jsdom, because both halves of what is under test are agreements with a DOM API — the scrub
 * IS `history.replaceState`, and there is no pure part of it left to extract once the pure
 * string work is `stripLivePreviewToken`, which is tested here without a DOM.
 *
 * ⚠ **`./token` is mocked, and only here.** The signature check is a cross-repo format with
 * its own suite (`token.test.ts`), which mints with the construction SahajCloud mints with.
 * What these cases are about is the SEQUENCE around it: that nothing is unlocked before the
 * answer arrives, and that a `false` leaves nothing behind. Signing a real token would need
 * the CMS's private key, which by design does not exist on this side.
 */
const verify = vi.hoisted(() => vi.fn())

vi.mock('./token', () => ({ verifyLivePreviewToken: verify }))

const at = (url: string) => window.history.replaceState(null, '', url)

beforeEach(() => {
  verify.mockReset()
  verify.mockResolvedValue(true)
  Object.assign(livePreview, LIVE_PREVIEW_INACTIVE)
  at('/')
})

afterEach(() => {
  Object.assign(livePreview, LIVE_PREVIEW_INACTIVE)
})

describe('stripLivePreviewToken', () => {
  it('removes the token and nothing else', () => {
    expect(
      stripLivePreviewToken('https://atlas.example/india/pune/507?locale=fr&live-preview=t#agenda'),
    ).toBe('https://atlas.example/india/pune/507?locale=fr#agenda')
  })

  it('leaves a URL with no token untouched, byte for byte', () => {
    const url = 'https://atlas.example/india/pune/507?locale=fr#agenda'

    expect(stripLivePreviewToken(url)).toBe(url)
  })

  it('returns an unparseable value unchanged rather than mangling it', () => {
    expect(stripLivePreviewToken('not a url')).toBe('not a url')
  })
})

describe('captureLivePreview', () => {
  it('does nothing on a page with no token', () => {
    at('/india/pune/507?locale=fr')

    expect(captureLivePreview()).toBe(false)
    expect(livePreview).toEqual(LIVE_PREVIEW_INACTIVE)
    expect(window.location.search).toBe('?locale=fr')
  })

  it('stashes the token WITHOUT opening the session', () => {
    at('/india/pune/507?live-preview=t0k3n')

    expect(captureLivePreview()).toBe(true)
    expect(livePreview.token).toBe('t0k3n')
    // The whole point of splitting capture from activation. Anything reading `active` between
    // the two — the request interceptor above all — must see a closed session.
    expect(livePreview.active).toBe(false)
  })

  it('scrubs ONLY the token, keeping the path, the other parameters and the hash', () => {
    // The scrub used to `replaceState` to `/preview`, which threw away the query string and
    // the hash with it. That was invisible while the target was always `/preview`. On a
    // document's own page it would discard the route being previewed.
    at('/india/pune/507?locale=fr&live-preview=t0k3n#agenda')

    captureLivePreview()

    expect(window.location.pathname).toBe('/india/pune/507')
    expect(window.location.search).toBe('?locale=fr')
    expect(window.location.hash).toBe('#agenda')
  })

  it('leaves the /preview boot route where it is', () => {
    at('/preview?collection=user-submissions&id=42&live-preview=t0k3n')

    captureLivePreview()

    expect(window.location.pathname).toBe('/preview')
    expect(livePreview.collection).toBe('user-submissions')
    expect(livePreview.id).toBe('42')
  })
})

describe('activateLivePreview', () => {
  it('opens the session once the token verifies', async () => {
    at('/india/pune/507?live-preview=t0k3n')
    captureLivePreview()

    await expect(activateLivePreview()).resolves.toBe(true)
    expect(livePreview.active).toBe(true)
    expect(verify).toHaveBeenCalledWith('t0k3n')
  })

  it('opens nothing for a token that does not verify', async () => {
    verify.mockResolvedValue(false)
    at('/india/pune/507?live-preview=forged')
    captureLivePreview()

    await expect(activateLivePreview()).resolves.toBe(false)
    expect(livePreview.active).toBe(false)
  })

  it('wipes the refused token, so nothing can ever forward it', async () => {
    // An unproven token is not a credential. Leaving one in memory is how it eventually
    // reaches the `x-sahajcloud-preview-secret` header on somebody's ordinary page view.
    verify.mockResolvedValue(false)
    at('/india/pune/507?live-preview=forged')
    captureLivePreview()

    await activateLivePreview()

    expect(livePreview).toEqual(LIVE_PREVIEW_INACTIVE)
  })

  it('opens nothing, and does not call the verify, with no token stashed', async () => {
    await expect(activateLivePreview()).resolves.toBe(false)
    expect(verify).not.toHaveBeenCalled()
  })

  it('survives a throwing verify rather than taking the widget down', async () => {
    // This runs at boot, before React mounts. An unhandled rejection here is a blank page on
    // a host we do not own, over a stray query parameter.
    verify.mockRejectedValue(new Error('subtle crypto unavailable'))
    at('/india/pune/507?live-preview=t0k3n')
    captureLivePreview()

    await expect(activateLivePreview()).resolves.toBe(false)
    expect(livePreview.active).toBe(false)
  })
})

/**
 * The reader that replaced the pathname gate.
 *
 * ⚠ **The old spec pinned the opposite behaviour, case for case.** It asserted that anything
 * other than `/preview` returns `null`, and that `/preview` with NOTHING on it still returns
 * `{ active: true }`. Both were true, both were the defect: the route was the whole check, and
 * a session opened without anything being verified. Every case below is written against what
 * has to be true instead.
 */
describe('readLivePreviewParams', () => {
  it('reads a token off ANY route, because the path now names the document', () => {
    const session = readLivePreviewParams('/india/pune/507', '?live-preview=t0k3n&locale=fr')

    expect(session?.token).toBe('t0k3n')
  })

  it('NEVER reports an active session — only a verified token may open one', () => {
    // The gate this replaced was the pathname, and it returned `active: true`. Since any path
    // can carry a token now, and `public/_redirects` answers the SPA shell for every path,
    // a reader that opened the session here would make `sahajatlas.com/x?live-preview=junk`
    // a link that inerts every control on the page for whoever it was sent to.
    expect(readLivePreviewParams('/', '?live-preview=t0k3n')?.active).toBe(false)
    expect(
      readLivePreviewParams('/preview', '?live-preview=t0k3n&collection=user-submissions')?.active,
    ).toBe(false)
  })

  it('returns null when there is no token at all, on any route', () => {
    expect(readLivePreviewParams('/', '')).toBeNull()
    expect(readLivePreviewParams('/india/pune/507', '?locale=fr')).toBeNull()
    // Including the route that used to be the entire gate: `/preview` with no token is a
    // stranger typing a URL, not the CMS.
    expect(readLivePreviewParams('/preview', '?collection=user-submissions&id=42')).toBeNull()
  })

  it('reads collection and id ONLY on the /preview boot route', () => {
    const boot = readLivePreviewParams(
      '/preview',
      '?collection=user-submissions&id=42&live-preview=t0k3n',
    )

    expect(boot).toEqual({
      active: false,
      collection: 'user-submissions',
      id: '42',
      token: 't0k3n',
    })
  })

  it('ignores a collection and id smuggled onto a document route', () => {
    // On a document route the path IS the identity. A `?collection=` beside it is a second,
    // unauthenticated claim about what is on screen, and the controller must never see it.
    const session = readLivePreviewParams(
      '/india/pune/507',
      '?collection=user-submissions&id=42&live-preview=t0k3n',
    )

    expect(session).toMatchObject({ collection: null, id: null })
  })

  it('nulls a collection that is not the one route still served by /preview', () => {
    // `events` and `regions` were valid here until their previews moved to their own pages.
    // `event-submissions` was THIS route's collection until SahajCloud#800 folded it into
    // `user-submissions`, so the old spelling has to stop opening a session.
    for (const collection of ['events', 'regions', 'venues', 'event-submissions']) {
      expect(
        readLivePreviewParams('/preview', `?collection=${collection}&live-preview=t0k3n`)
          ?.collection,
      ).toBeNull()
    }
  })
})
