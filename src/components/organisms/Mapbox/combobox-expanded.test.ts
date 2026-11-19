// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { isExpanded, syncGeocoderExpanded } from './combobox-expanded'

// The library case, in its purest form: the geocoder's input is the library's own node, and
// what is asserted is a property of the attribute our code writes onto it. There is no pure
// half — the state is read off sibling DOM — so this spec drives a real one.

const field = (listHtml = '') => {
  const scope = document.createElement('div')

  scope.innerHTML = `
    <input role="combobox" aria-autocomplete="list" aria-controls="results" />
    ${listHtml}
  `
  document.body.append(scope)

  return scope
}

const input = (scope: HTMLElement) => scope.querySelector('input') as HTMLInputElement

describe('isExpanded', () => {
  it('is false while the list the input names does not exist', () => {
    const scope = field()

    expect(isExpanded(scope, input(scope))).toBe(false)
  })

  it('is false for a list that exists and holds nothing', () => {
    const scope = field('<div id="results"></div>')

    expect(isExpanded(scope, input(scope))).toBe(false)
  })

  it('is true once the list holds a suggestion', () => {
    const scope = field('<div id="results"><div role="option">Cambridge</div></div>')

    expect(isExpanded(scope, input(scope))).toBe(true)
  })

  it('is false for a list the library has hidden, suggestions and all', () => {
    const scope = field('<div hidden id="results"><div role="option">Cambridge</div></div>')

    expect(isExpanded(scope, input(scope))).toBe(false)
  })

  // The widget renders inside a shadow root, where a document-wide lookup answers about the
  // HOST's page. An id the host happens to use must not read as our own suggestions.
  it('looks the list up inside the scope, never across the document', () => {
    const elsewhere = document.createElement('div')

    elsewhere.innerHTML = '<div id="results"><div role="option">Somebody else\'s</div></div>'
    document.body.append(elsewhere)

    const scope = field()

    expect(isExpanded(scope, input(scope))).toBe(false)
    elsewhere.remove()
  })
})

describe('syncGeocoderExpanded', () => {
  it('writes the attribute the role requires, before anything has happened', () => {
    const scope = field()
    const release = syncGeocoderExpanded(scope)

    expect(input(scope).getAttribute('aria-expanded')).toBe('false')
    release()
  })

  it('follows the list as the library opens and closes it', async () => {
    const scope = field()
    const release = syncGeocoderExpanded(scope)
    const list = document.createElement('div')

    list.id = 'results'
    list.innerHTML = '<div role="option">Cambridge</div>'
    scope.append(list)

    await Promise.resolve()
    expect(input(scope).getAttribute('aria-expanded')).toBe('true')

    list.remove()
    await Promise.resolve()
    expect(input(scope).getAttribute('aria-expanded')).toBe('false')

    release()
  })

  it('stops writing once released, so a remounted geocoder is not two observers', async () => {
    const scope = field()
    const release = syncGeocoderExpanded(scope)

    release()

    const list = document.createElement('div')

    list.id = 'results'
    list.innerHTML = '<div role="option">Cambridge</div>'
    scope.append(list)

    await Promise.resolve()
    expect(input(scope).getAttribute('aria-expanded')).toBe('false')
  })
})
