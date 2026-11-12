// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { popupOwnsEscape } from './escape-owner'

import { OPEN_POPOVER_ATTRIBUTE } from '@/hooks/use-popover'

// jsdom for `Element.matches` and `querySelector`; the ladder itself runs inside vaul's Radix
// layer, which only a browser exercises (`docs/testing.md`).
const html = (markup: string) => {
  document.body.innerHTML = markup

  return document.body
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('popupOwnsEscape', () => {
  it('leaves the key to an open popover, wherever focus is', () => {
    const overlay = html(`<div ${OPEN_POPOVER_ATTRIBUTE}=""><button>Tue</button></div>`)

    expect(popupOwnsEscape([document.body], overlay)).toBe(true)
  })

  it('gives the key to the stack once the popover has closed', () => {
    const overlay = html('<div role="dialog"><button>Tue</button></div>')

    expect(popupOwnsEscape([document.body], overlay)).toBe(false)
    expect(popupOwnsEscape([document.body], undefined)).toBe(false)
  })

  it('leaves the key to an open suggestion list on its path', () => {
    const overlay = html('<input aria-expanded="true" />')
    const input = overlay.querySelector('input')!

    expect(popupOwnsEscape([input, overlay], overlay)).toBe(true)
  })

  it('does not take the key for an expanded control that is not a suggestion list', () => {
    const overlay = html('<button aria-expanded="true">More filters</button>')
    const button = overlay.querySelector('button')!

    expect(popupOwnsEscape([button, overlay], overlay)).toBe(false)
  })
})
