import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DrawerHeader, DrawerToolbar } from './Drawer'

// Both bands that mount a `SearchField` hand its suggestion list the band's width (#370).
// A band without one hands it nothing, so a plain toolbar stays out of it.
const WIDTH = '[--sy-results-w:calc(100cqi_-_2px)]'
const CONTAINER = '[container-type:inline-size]'

describe('the suggestion list width', () => {
  it.each([
    ['the header', renderToStaticMarkup(<DrawerHeader>field</DrawerHeader>)],
    ["a search field's toolbar", renderToStaticMarkup(<DrawerToolbar field>field</DrawerToolbar>)],
  ])('is set by %s', (_, markup) => {
    expect(markup).toContain(WIDTH)
    expect(markup).toContain(CONTAINER)
  })

  it('is not set by a plain toolbar', () => {
    const markup = renderToStaticMarkup(<DrawerToolbar>controls</DrawerToolbar>)

    expect(markup).not.toContain(WIDTH)
    expect(markup).not.toContain(CONTAINER)
  })
})
