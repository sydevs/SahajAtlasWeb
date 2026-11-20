// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { repairGeocoderDom } from './geocoder-dom'

/**
 * jsdom, because the subject is one DOM disagreement: a node inside a shadow root against
 * `document.body.querySelector`, which cannot see it. A pure test has nothing to assert.
 *
 * ⚠ **This fixture copies the library, and the library is what it has to match.** The
 * shape below — an `[aria-live]` container holding a `<div>` whose id is the geocoder's
 * seed plus `--search-listbox__description`, inserted before the input — is
 * `createAriaLiveElement` and the Geocoder's own mount, read off
 * `@mapbox/search-js-web@1.6.0`'s `dist/index-esm.js`. `LOOKUP` below is that
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

describe('repairGeocoderDom — the live region', () => {
  it('puts a region the library could not reach back in its view', () => {
    const { scope, mountRegion } = mountGeocoder()

    mountRegion()

    // The defect, asserted rather than assumed: this is the read that goes quiet.
    expect(LOOKUP()).toBe(null)

    repairGeocoderDom(scope)

    expect(LOOKUP()).not.toBe(null)
    expect(LOOKUP()?.parentElement?.getAttribute('aria-live')).toBe('polite')
  })

  it('waits for a region the geocoder has not inserted yet', async () => {
    const { scope, mountRegion } = mountGeocoder()

    // Nothing to hoist at mount. A read-once version would stop here, and the region the
    // custom element inserts a tick later would stay unreachable.
    repairGeocoderDom(scope)
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

    repairGeocoderDom(scope)

    expect(scope.parentNode).not.toBe(document.body)
    expect(LOOKUP()).toBe(null)
  })

  it('takes the region away again on teardown, since the next seed differs', async () => {
    const { scope, mountRegion } = mountGeocoder()

    mountRegion()

    const stop = repairGeocoderDom(scope)

    expect(LOOKUP()).not.toBe(null)

    stop()

    expect(LOOKUP()).toBe(null)

    // The observer is disconnected too, so a later insertion is nobody's business.
    mountRegion()
    await Promise.resolve()

    expect(LOOKUP()).toBe(null)
  })
})

/**
 * The library case, in its purest form: the geocoder's input is the library's own node, and
 * what is asserted is a property of the one attribute our code writes onto it. There is no
 * pure half — the state is read off the live tree — so this spec drives a real one.
 *
 * ⚠ **The second case is the load-bearing one.** `@mapbox/search-js-web` maintains
 * `aria-expanded` from its own show and hide paths, so the defect this module could introduce
 * is overwriting a value the library has already set. The seed must happen once and never
 * again.
 */

const field = (attributes = '') => {
  const scope = document.createElement('div')

  scope.innerHTML = `<input role="combobox" aria-autocomplete="list" ${attributes} />`
  document.body.append(scope)

  return scope
}

const input = (scope: HTMLElement) => scope.querySelector('input') as HTMLInputElement

describe('repairGeocoderDom — the combobox state', () => {
  it('seeds the attribute the role requires, which the library renders without', () => {
    const scope = field()
    const release = repairGeocoderDom(scope)

    expect(input(scope).getAttribute('aria-expanded')).toBe('false')
    release()
  })

  it('never writes over a value the library has set', async () => {
    const scope = field('aria-expanded="true"')
    const release = repairGeocoderDom(scope)

    expect(input(scope).getAttribute('aria-expanded')).toBe('true')

    // The library opens its list, which is a childList mutation inside the observed scope —
    // exactly the moment a second writer would overwrite the value it had just set.
    const list = document.createElement('div')

    list.innerHTML = '<div role="option">Cambridge</div>'
    scope.append(list)

    await Promise.resolve()
    expect(input(scope).getAttribute('aria-expanded')).toBe('true')

    release()
  })

  it('seeds an input the library adds after the first pass', async () => {
    const scope = field('aria-expanded="false"')
    const release = repairGeocoderDom(scope)
    const late = document.createElement('input')

    late.setAttribute('role', 'combobox')
    scope.append(late)

    await Promise.resolve()
    expect(late.getAttribute('aria-expanded')).toBe('false')

    release()
  })

  it('stops writing once released, so a remounted geocoder is not two observers', async () => {
    const scope = document.createElement('div')

    document.body.append(scope)

    const release = repairGeocoderDom(scope)

    release()

    const late = document.createElement('input')

    late.setAttribute('role', 'combobox')
    scope.append(late)

    await Promise.resolve()
    expect(late.hasAttribute('aria-expanded')).toBe(false)
  })
})
