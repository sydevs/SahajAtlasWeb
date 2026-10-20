// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { AnimatePresence } from 'framer-motion'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ViewLayer } from './ViewLayer'

/**
 * The drawer's view cross-fade, mid-fade.
 *
 * jsdom, because the subject is a re-render: a key change leaves the outgoing layer mounted
 * while it exits, and only then can a spec ask what that layer is doing. jsdom has no layout,
 * so the halfway-down flicker itself is out of reach here — `no-restricted-syntax` in
 * `eslint.config.js` refuses the `popLayout` that caused it, and the absolute layer is what
 * replaced it.
 */

// ⚠ framer-motion steps its animations on `requestAnimationFrame`, captured when it loads, so
// fake timers installed per test never reach it. Left real, a loaded lane can finish the 150ms
// exit before the assertions run, and the outgoing layer is already gone — a spec that passes or
// fails on the machine's load. Stubbed before any import, no frame ever runs: every fade holds.
vi.hoisted(() => {
  globalThis.requestAnimationFrame = () => 0
  globalThis.cancelAnimationFrame = () => {}
})

afterEach(() => {
  document.body.innerHTML = ''
})

function mountInShadowRoot() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  const container = document.createElement('div')

  host.attachShadow({ mode: 'open' }).append(container)

  return { root: host.shadowRoot as ShadowRoot, reactRoot: createRoot(container) }
}

const stack = (view: string) => (
  <AnimatePresence>
    <ViewLayer key={view}>{view}</ViewLayer>
  </AnimatePresence>
)

describe('ViewLayer', () => {
  it('overlaps the outgoing and incoming views, rather than stacking them in flow', async () => {
    const { root, reactRoot } = mountInShadowRoot()

    await act(async () => reactRoot.render(stack('region')))
    await act(async () => reactRoot.render(stack('event')))

    const layers = [...root.querySelectorAll('div > div')]

    expect(layers.map((layer) => layer.textContent)).toEqual(['region', 'event'])

    for (const layer of layers) expect(layer.className).toContain('absolute inset-0')

    await act(async () => reactRoot.unmount())
  })

  it('takes the outgoing view out of reach the moment it starts to leave', async () => {
    const { root, reactRoot } = mountInShadowRoot()

    await act(async () => reactRoot.render(stack('region')))
    await act(async () => reactRoot.render(stack('event')))

    const [outgoing, incoming] = [...root.querySelectorAll('div > div')]

    expect(outgoing.getAttribute('aria-hidden')).toBe('true')
    expect(outgoing.className).toContain('pointer-events-none')
    expect(incoming.getAttribute('aria-hidden')).toBeNull()
    expect(incoming.className).not.toContain('pointer-events-none')

    await act(async () => reactRoot.unmount())
  })
})
