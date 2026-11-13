// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Drawer, DrawerContent } from './Drawer'

/**
 * `focusOnOpen`: a panel that opens beside the page (the docked add-a-class panel) takes focus,
 * so a keyboard user does not have to Tab through the page to reach it. jsdom, because the move
 * is Radix's open auto-focus, which vaul turns off for every other drawer.
 */
let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

function openBesideFocusedLink(focusOnOpen: boolean) {
  const link = document.createElement('a')
  const host = document.createElement('div')

  link.href = '#'
  document.body.append(link, host)
  link.focus()
  const root = createRoot(host)

  act(() =>
    root.render(
      <Drawer open direction="right" dismissible={false}>
        <DrawerContent aria-label="Panel" focusOnOpen={focusOnOpen}>
          <button type="button">Close</button>
        </DrawerContent>
      </Drawer>,
    ),
  )
  cleanup = () => act(() => root.unmount())

  return link
}

describe('DrawerContent — focusOnOpen', () => {
  it('moves focus to the panel itself when it opens', () => {
    openBesideFocusedLink(true)

    expect(document.activeElement).toBe(document.querySelector('[data-vaul-drawer]'))
  })

  it('leaves focus where it was otherwise', () => {
    const link = openBesideFocusedLink(false)

    expect(document.activeElement).toBe(link)
  })
})
