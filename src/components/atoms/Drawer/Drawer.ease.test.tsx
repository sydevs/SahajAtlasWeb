// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Drawer, DrawerContent, type DrawerProps } from './Drawer'

/**
 * The floating panel's height ease, which no CSS transition can carry: the height stays
 * `auto` while only the content changes.
 *
 * jsdom, because the subject is an agreement with two DOM APIs — `ResizeObserver` and
 * `Element.animate` — and jsdom has neither, so both are faked here and driven by hand. The
 * fake observer is keyed by the element it was given, so a second observer elsewhere in the
 * tree (`DrawerFooter` carries one) can never answer for the panel's.
 */

const motion = vi.hoisted(() => ({ reduce: false }))

vi.mock('@/hooks/use-reduced-motion', () => ({ usePrefersReducedMotion: () => motion.reduce }))

type Watch = { deliver: () => void; disconnected: boolean }

let watches: Map<Element, Watch>

class FakeObserver {
  private observed: Element[] = []

  constructor(private callback: () => void) {}

  observe(element: Element) {
    watches.set(element, { deliver: this.callback, disconnected: false })
    this.observed.push(element)
  }

  disconnect() {
    for (const element of this.observed) {
      const observed = watches.get(element)

      if (observed) observed.disconnected = true
    }
  }
}

let height = 400
let playState: AnimationPlayState = 'running'
const animate = vi.fn()
const cancel = vi.fn()

/** The panel vaul renders. `animate` is read at call time, so faking it after mount is enough. */
function panel() {
  const element = document.querySelector<HTMLElement>('[data-vaul-drawer]')

  expect(element, 'nothing matched [data-vaul-drawer]').not.toBeNull()
  Object.defineProperty(element!, 'offsetHeight', { configurable: true, get: () => height })
  element!.animate = animate.mockImplementation(
    () =>
      ({
        get playState() {
          return playState
        },
        cancel,
      }) as unknown as Animation,
  )

  return element!
}

const watch = () => watches.get(panel())

let host: HTMLElement
let root: Root

const mount = (props: Partial<DrawerProps> = {}) =>
  act(() =>
    root.render(
      <Drawer open direction="left" mode="anchored" {...props}>
        <DrawerContent aria-label="Test panel">content</DrawerContent>
      </Drawer>,
    ),
  )

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeObserver)
  watches = new Map()
  height = 400
  playState = 'running'
  motion.reduce = false
  animate.mockClear()
  cancel.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe('DrawerContent — the floating panel’s height ease', () => {
  it('eases from the old height to the new one, but not on the first delivery', () => {
    mount()
    const observed = watch()!

    observed.deliver()
    expect(animate).not.toHaveBeenCalled()

    height = 700
    observed.deliver()
    expect(animate).toHaveBeenCalledWith(
      { height: ['400px', '700px'] },
      expect.objectContaining({ duration: 200 }),
    )
  })

  it('lets a running ease finish, then eases the rest from where it stopped', () => {
    mount()
    const observed = watch()!

    observed.deliver()
    height = 700
    observed.deliver()

    height = 760
    observed.deliver()
    expect(animate).toHaveBeenCalledTimes(1)

    playState = 'finished'
    observed.deliver()
    expect(animate).toHaveBeenLastCalledWith({ height: ['700px', '760px'] }, expect.anything())
  })

  it('never eases under reduced motion', () => {
    motion.reduce = true
    mount()

    expect(watch()).toBeUndefined()
    expect(animate).not.toHaveBeenCalled()
  })

  // The bottom sheet, the map-less `filled` drawer and the wide calendar each own their own
  // height. Only the floating panel takes it from its view.
  const UNEASED: Partial<DrawerProps>[] = [
    { direction: 'bottom' },
    { direction: 'right' },
    { mode: 'filled' },
    { wide: true },
  ]

  it.each(UNEASED)('observes nothing for a panel that is not the floating one — %o', (variant) => {
    mount(variant)

    expect(watch()).toBeUndefined()
  })

  it('stops observing and cancels the ease when the panel stops easing', () => {
    mount()
    const observed = watch()!

    observed.deliver()
    height = 700
    observed.deliver()

    // The full-width calendar owns its own height, so `wide` turns the ease off.
    mount({ wide: true })
    expect(observed.disconnected).toBe(true)
    expect(cancel).toHaveBeenCalled()
  })
})
