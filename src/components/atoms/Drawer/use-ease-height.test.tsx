// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useEaseHeight } from './use-ease-height'

/**
 * jsdom, because the subject is an agreement with two DOM APIs — `ResizeObserver` and
 * `Element.animate` — and jsdom has neither, so both are faked here and driven by hand.
 */

const motion = vi.hoisted(() => ({ reduce: false }))

vi.mock('@/hooks/use-reduced-motion', () => ({ usePrefersReducedMotion: () => motion.reduce }))

let deliver: () => void
let observers = 0
let disconnected = false

class FakeObserver {
  constructor(callback: () => void) {
    deliver = callback
    observers++
  }
  observe() {}
  disconnect() {
    disconnected = true
  }
}

function Probe({ panel }: { panel: HTMLElement | null }) {
  useEaseHeight(panel)

  return null
}

function mountPanel(panel: HTMLElement | null) {
  const root = createRoot(document.createElement('div'))

  act(() => root.render(<Probe panel={panel} />))

  return root
}

let height = 400
let playState: AnimationPlayState = 'running'
const animate = vi.fn()
const cancel = vi.fn()

function fakePanel() {
  const panel = document.createElement('div')

  Object.defineProperty(panel, 'offsetHeight', { get: () => height })
  panel.animate = animate.mockImplementation(
    () =>
      ({
        get playState() {
          return playState
        },
        cancel,
      }) as unknown as Animation,
  )

  return panel
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeObserver)
  height = 400
  playState = 'running'
  observers = 0
  disconnected = false
  motion.reduce = false
  animate.mockClear()
  cancel.mockClear()
})

afterEach(() => vi.unstubAllGlobals())

describe('useEaseHeight', () => {
  it('eases from the old height to the new one, but not on the first delivery', () => {
    mountPanel(fakePanel())

    deliver()
    expect(animate).not.toHaveBeenCalled()

    height = 700
    deliver()
    expect(animate).toHaveBeenCalledWith(
      { height: ['400px', '700px'] },
      expect.objectContaining({ duration: 200 }),
    )
  })

  it('lets a running ease finish, then eases the rest from where it stopped', () => {
    mountPanel(fakePanel())
    deliver()
    height = 700
    deliver()

    height = 760
    deliver()
    expect(animate).toHaveBeenCalledTimes(1)

    playState = 'finished'
    deliver()
    expect(animate).toHaveBeenLastCalledWith({ height: ['700px', '760px'] }, expect.anything())
  })

  it('never eases under reduced motion', () => {
    motion.reduce = true
    mountPanel(fakePanel())

    expect(observers).toBe(0)
    expect(animate).not.toHaveBeenCalled()
  })

  it('stops observing and cancels the ease when the panel is turned off', () => {
    const panel = fakePanel()
    const root = mountPanel(panel)

    deliver()
    height = 700
    deliver()

    act(() => root.render(<Probe panel={null} />))
    expect(disconnected).toBe(true)
    expect(cancel).toHaveBeenCalled()
  })
})
