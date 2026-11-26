import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DrawerHeader, DrawerToolbar } from './Drawer'
import { RESULTS_BAND } from './drawer-style'

// Both bands that mount a `SearchField` mark themselves as the band its suggestion list runs to
// (#370; `MapSearch` measures it). A band without one is not marked, so a plain toolbar stays out.

describe('the suggestion list width', () => {
  it.each([
    ['the header', renderToStaticMarkup(<DrawerHeader>field</DrawerHeader>)],
    ["a search field's toolbar", renderToStaticMarkup(<DrawerToolbar field>field</DrawerToolbar>)],
  ])('is set by %s', (_, markup) => {
    expect(markup).toContain(RESULTS_BAND)
  })

  it('is not set by a plain toolbar', () => {
    const markup = renderToStaticMarkup(<DrawerToolbar>controls</DrawerToolbar>)

    expect(markup).not.toContain(RESULTS_BAND)
  })
})
