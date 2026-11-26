// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { Drawer, DrawerContent } from './Drawer'

/**
 * `enterInPlace`: where vaul starts the panel, so a drawer taking over from a stand-in already on
 * screen does not slide in a second time.
 *
 * jsdom, like `Drawer.snap.test.tsx`, because this is an agreement with vaul: its stylesheet
 * (vendored in `styles/vaul.css`) starts a panel at `--initial-transform`, off screen by default,
 * and animates from there to the snap point. jsdom lays nothing out, so this asserts the variable
 * the panel starts from, not the motion.
 */
let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

function mount(element: React.ReactElement) {
  const host = document.createElement('div')

  document.body.append(host)
  const root = createRoot(host)

  act(() => root.render(element))
  cleanup = () => act(() => root.unmount())
}

const start = () =>
  document
    .querySelector<HTMLElement>('[data-vaul-drawer]')
    ?.style.getPropertyValue('--initial-transform')

describe('Drawer — enterInPlace', () => {
  it('starts a sheet at its pixel snap point, not off screen', () => {
    mount(
      <Drawer enterInPlace open activeSnapPoint="380px" snapPoints={['104px', '380px', 0.97]}>
        <DrawerContent aria-label="Sheet">content</DrawerContent>
      </Drawer>,
    )

    expect(start()).toBe('calc(100% - 380px)')
  })

  it('starts a sheet at a fractional snap point by the share left showing', () => {
    mount(
      <Drawer enterInPlace open activeSnapPoint={0.97} snapPoints={['104px', '380px', 0.97]}>
        <DrawerContent aria-label="Sheet">content</DrawerContent>
      </Drawer>,
    )

    expect(start()).toMatch(/^3(\.0+\d*)?%$/)
  })

  it('starts a side panel fully open', () => {
    mount(
      <Drawer enterInPlace open direction="left">
        <DrawerContent aria-label="Panel">content</DrawerContent>
      </Drawer>,
    )

    expect(start()).toBe('0px')
  })

  it('leaves every other drawer to slide in from its edge', () => {
    mount(
      <Drawer open activeSnapPoint="380px" snapPoints={['104px', '380px', 0.97]}>
        <DrawerContent aria-label="Sheet">content</DrawerContent>
      </Drawer>,
    )

    expect(start()).toBe('')
  })
})
