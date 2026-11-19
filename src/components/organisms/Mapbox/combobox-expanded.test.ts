// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { syncGeocoderExpanded } from './combobox-expanded'

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

describe('syncGeocoderExpanded', () => {
  it('seeds the attribute the role requires, which the library renders without', () => {
    const scope = field()
    const release = syncGeocoderExpanded(scope)

    expect(input(scope).getAttribute('aria-expanded')).toBe('false')
    release()
  })

  it('never writes over a value the library has set', async () => {
    const scope = field('aria-expanded="true"')
    const release = syncGeocoderExpanded(scope)

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
    const release = syncGeocoderExpanded(scope)
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

    const release = syncGeocoderExpanded(scope)

    release()

    const late = document.createElement('input')

    late.setAttribute('role', 'combobox')
    scope.append(late)

    await Promise.resolve()
    expect(late.hasAttribute('aria-expanded')).toBe(false)
  })
})
