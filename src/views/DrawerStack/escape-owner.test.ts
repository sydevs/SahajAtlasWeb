// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { popupOwnsEscape } from './escape-owner'

import { OPEN_POPOVER_ATTRIBUTE } from '@/hooks/use-popover'

// jsdom for `querySelector`; the ladder itself runs inside vaul's Radix layer, which only a
// browser exercises (`docs/testing.md`).
const html = (markup: string) => {
  document.body.innerHTML = markup

  return document.body
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('popupOwnsEscape', () => {
  it('leaves the key to an open popover, wherever focus is', () => {
    expect(
      popupOwnsEscape(html(`<div ${OPEN_POPOVER_ATTRIBUTE}=""><button>Tue</button></div>`)),
    ).toBe(true)
  })

  it('gives the key to the stack once the popover has closed', () => {
    expect(popupOwnsEscape(html('<div role="dialog"><button>Tue</button></div>'))).toBe(false)
    expect(popupOwnsEscape(undefined)).toBe(false)
  })
})
