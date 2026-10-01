// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { hoistGeocoderLiveRegion } from './aria-live'

/**
 * jsdom, because the subject is one DOM disagreement: a node inside a shadow root against
 * `document.body.querySelector`, which cannot see it. A pure test has nothing to assert.
 *
 * ⚠ **This fixture copies the library, and the library is what it has to match.** The
 * shape below — an `[aria-live]` container holding a `<div>` whose id is the geocoder's
 * seed plus `--search-listbox__description`, inserted before the input — is
 * `createAriaLiveElement` and the Geocoder's own mount, read off
 * `@mapbox/search-js-web@1.0.0-beta.24`'s `dist/index-esm.js`. `LOOKUP` below is that
 * file's `setLiveRegionMessage`, verbatim, so these specs fail if the fix stops satisfying
 * the real reader rather than a paraphrase of it.
 */

const SEED = 'mbx1a2b3c'

/** `setLiveRegionMessage`'s own expression. */
const LOOKUP = () =>
  document.body.querySelector(`[id="${SEED}--search-listbox__description"]`) ?? null

afterEach(() => {
  document.body.innerHTML = ''
})

/** The geocoder, mounted where the widget now puts it: inside an open root. */
function mountGeocoder() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  const root = host.attachShadow({ mode: 'open' })
  const scope = document.createElement('div')

  root.append(scope)

  const mountRegion = () => {
    const region = document.createElement('div')

    region.setAttribute('aria-live', 'polite')
    region.setAttribute('style', 'position: absolute;width: 1px;overflow: hidden;')

    const description = document.createElement('div')

    description.id = `${SEED}--search-listbox__description`
    region.append(description)

    const input = document.createElement('input')

    scope.append(region, input)
  }

  return { scope, mountRegion }
}

describe('hoistGeocoderLiveRegion', () => {
  it('puts a region the library could not reach back in its view', () => {
    const { scope, mountRegion } = mountGeocoder()

    mountRegion()

    // The defect, asserted rather than assumed: this is the read that goes quiet.
    expect(LOOKUP()).toBe(null)

    hoistGeocoderLiveRegion(scope)

    expect(LOOKUP()).not.toBe(null)
    expect(LOOKUP()?.parentElement?.getAttribute('aria-live')).toBe('polite')
  })

  it('waits for a region the geocoder has not inserted yet', async () => {
    const { scope, mountRegion } = mountGeocoder()

    // Nothing to hoist at mount. A read-once version would stop here, and the region the
    // custom element inserts a tick later would stay unreachable.
    hoistGeocoderLiveRegion(scope)
    mountRegion()

    expect(LOOKUP()).toBe(null)

    await Promise.resolve()

    expect(LOOKUP()).not.toBe(null)
  })

  it('moves nothing when the only match is one of our own ancestors', () => {
    const { scope, mountRegion } = mountGeocoder()

    mountRegion()

    // A library version that stopped wrapping its description: `closest` then walks past
    // `scope` and finds this. Hoisting it would take the widget's subtree to the host.
    scope.querySelector('[aria-live]')?.removeAttribute('aria-live')
    scope.setAttribute('aria-live', 'polite')

    hoistGeocoderLiveRegion(scope)

    expect(scope.parentNode).not.toBe(document.body)
    expect(LOOKUP()).toBe(null)
  })

  it('takes the region away again on teardown, since the next seed differs', async () => {
    const { scope, mountRegion } = mountGeocoder()

    mountRegion()

    const stop = hoistGeocoderLiveRegion(scope)

    expect(LOOKUP()).not.toBe(null)

    stop()

    expect(LOOKUP()).toBe(null)

    // The observer is disconnected too, so a later insertion is nobody's business.
    mountRegion()
    await Promise.resolve()

    expect(LOOKUP()).toBe(null)
  })
})
