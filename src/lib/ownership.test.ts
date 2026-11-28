// Every state × event cell of the ownership machine, with the element reduced to the one property
// it reads. `Widget.replace.test.tsx` drives the same transitions through a real custom element.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Ownable, TEARDOWN_GRACE_MS, createOwnership } from './ownership'

type Element = Ownable & { name: string; isConnected: boolean }

const element = (name: string): Element => ({ name, isConnected: true })

let release: ReturnType<typeof vi.fn<() => void>>
let refuse: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  vi.useFakeTimers()
  release = vi.fn<() => void>()
  refuse = vi.fn<() => void>()
})

afterEach(() => {
  vi.useRealTimers()
})

function start() {
  const page = createOwnership<Element>({ release, refuse })

  const connect = (el: Element, keyChanged = false) => {
    el.isConnected = true
    page.send({ type: 'connect', element: el, keyChanged })
  }
  const disconnect = (el: Element) => {
    el.isConnected = false
    page.send({ type: 'disconnect', element: el })
  }

  return { page, connect, disconnect, state: page.getState, owner: page.getOwner }
}

describe('vacant', () => {
  it('accepts the first element to connect', () => {
    const { connect, state, owner } = start()
    const a = element('a')

    connect(a)

    expect(state()).toBe('owned')
    expect(owner()).toBe(a)
    expect(release).not.toHaveBeenCalled()
  })

  it('ignores a disconnect, since nothing is owned', () => {
    const { disconnect, state } = start()

    disconnect(element('a'))

    expect(state()).toBe('vacant')
  })
})

describe('owned', () => {
  it('refuses a second element while the owner still stands', () => {
    const { connect, state, owner } = start()
    const a = element('a')

    connect(a)
    connect(element('b'))

    expect(state()).toBe('owned')
    expect(owner()).toBe(a)
    expect(refuse).toHaveBeenCalledTimes(1)
  })

  it('yields to an arrival when the owner left without a disconnect reaching us', () => {
    const { page, connect, owner } = start()
    const a = element('a')
    const b = element('b')

    connect(a)
    a.isConnected = false
    page.send({ type: 'connect', element: b, keyChanged: false })

    expect(owner()).toBe(b)
    expect(refuse).not.toHaveBeenCalled()
  })

  it('accepts the owner connecting again', () => {
    const { connect, state, owner } = start()
    const a = element('a')

    connect(a)
    connect(a)

    expect(state()).toBe('owned')
    expect(owner()).toBe(a)
    expect(refuse).not.toHaveBeenCalled()
  })

  it('starts the grace window when the owner disconnects', () => {
    const { connect, disconnect, state, owner } = start()
    const a = element('a')

    connect(a)
    disconnect(a)

    expect(state()).toBe('grace')
    expect(owner()).toBe(a)
    expect(release).not.toHaveBeenCalled()
  })

  it('ignores a refused duplicate disconnecting', () => {
    const { connect, disconnect, state } = start()
    const a = element('a')
    const b = element('b')

    connect(a)
    connect(b)
    disconnect(b)

    expect(state()).toBe('owned')
  })
})

describe('grace', () => {
  it('releases once nothing comes back inside the window', () => {
    const { connect, disconnect, state, owner } = start()
    const a = element('a')

    connect(a)
    disconnect(a)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS - 1)

    expect(release).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(state()).toBe('vacant')
    expect(owner()).toBeNull()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('keeps everything when the same element comes back (a move)', () => {
    const { connect, disconnect, state, owner } = start()
    const a = element('a')

    connect(a)
    disconnect(a)
    connect(a, true)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS * 2)

    // A returning element never asks about the key: `AtlasBoot` may not have claimed it yet.
    expect(state()).toBe('owned')
    expect(owner()).toBe(a)
    expect(release).not.toHaveBeenCalled()
  })

  it('hands over without a release when a replacement carries the same key', () => {
    const { connect, disconnect, state, owner } = start()
    const a = element('a')
    const b = element('b')

    connect(a)
    disconnect(a)
    connect(b, false)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS * 2)

    expect(state()).toBe('owned')
    expect(owner()).toBe(b)
    expect(release).not.toHaveBeenCalled()
  })

  it('releases at once, then hands over, when a replacement carries a different key', () => {
    const { connect, disconnect, state, owner } = start()
    const a = element('a')
    const b = element('b')

    connect(a)
    disconnect(a)
    connect(b, true)

    expect(release).toHaveBeenCalledTimes(1)
    expect(state()).toBe('owned')
    expect(owner()).toBe(b)

    vi.advanceTimersByTime(TEARDOWN_GRACE_MS * 2)

    expect(release).toHaveBeenCalledTimes(1)
  })

  it('ignores a second disconnect inside the window, and keeps its deadline', () => {
    const { connect, disconnect, state } = start()
    const a = element('a')

    connect(a)
    disconnect(a)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS / 2)
    disconnect(a)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS / 2)

    expect(state()).toBe('vacant')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('opens a fresh window for each departure', () => {
    const { connect, disconnect, state } = start()
    const a = element('a')

    connect(a)
    disconnect(a)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS - 1)
    connect(a)
    disconnect(a)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS - 1)

    expect(state()).toBe('grace')
    expect(release).not.toHaveBeenCalled()
  })
})

describe('the documented failure', () => {
  // A host that inserts the replacement BEFORE removing the old element: the arrival is refused
  // while its predecessor stands, gets no second `connectedCallback`, and the teardown then
  // leaves the page with nothing. Pinned so that changing it is a decision, not a side effect.
  it('leaves no widget when the replacement connects before the owner leaves', () => {
    const { connect, disconnect, state, owner } = start()
    const a = element('a')
    const b = element('b')

    connect(a)
    connect(b)
    disconnect(a)
    vi.advanceTimersByTime(TEARDOWN_GRACE_MS)

    expect(refuse).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
    expect(state()).toBe('vacant')
    expect(owner()).toBeNull()
  })
})
