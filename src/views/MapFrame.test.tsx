// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { MapFrame } from './MapFrame'

import { frameElement, overlayContainer } from '@/lib/overlay'
import { setThemeRoot } from '@/hooks/use-theme'

/**
 * The frame a contained map embed lives in (issue #169).
 *
 * **jsdom, because every property here is about a real document.** Whether the element exists,
 * whether it is published to the module the whole app portals through, and — the one that
 * matters most — WHEN it is published relative to its own children's first render. None of
 * those survive `renderToStaticMarkup`: refs and effects do not run there at all, so an SSR
 * spec would assert the markup and silently skip the entire contract.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  setThemeRoot(null)
  document.body.innerHTML = ''
})

function mount(node: React.ReactNode) {
  const wrapper = document.createElement('div')

  document.body.append(wrapper)
  setThemeRoot(wrapper)

  const host = document.createElement('div')

  wrapper.append(host)

  const root = createRoot(host)

  act(() => root.render(node))
  cleanup = () => act(() => root.unmount())

  return wrapper
}

const CHILD = 'the-interface-rendered'

/** Records what `overlayContainer()` answered on every render it performed. */
function Probe({ seen }: { seen: (HTMLElement | undefined)[] }) {
  seen.push(overlayContainer())

  return <span>{CHILD}</span>
}

describe('MapFrame, uncontained', () => {
  it('renders its children with no frame at all', () => {
    // The default map embed and the standalone build. An always-on wrapper would take the
    // containing block on every map embed, including the full-page ones the mode is built for
    // — where the viewport is the honest answer and the frame collapses to nothing.
    const wrapper = mount(
      <MapFrame contained={false}>
        <span>{CHILD}</span>
      </MapFrame>,
    )

    expect(wrapper.textContent).toContain(CHILD)
    expect(wrapper.querySelector('[data-sy-frame]')).toBeNull()
    expect(frameElement()).toBeNull()
    // `null` is what makes `--sy-sheet-top` a zero offset and hands vaul `window.innerHeight`
    // — i.e. exactly the behaviour that shipped before this existed.
    expect(overlayContainer()).toBe(wrapper)
  })
})

describe('MapFrame, contained by a box it cannot fill', () => {
  /**
   * ⚠ The case `mapMode` cannot see, because it reads the element's RECT.
   *
   * `min-height: 640px` gives a non-zero rect while `height: 100%` on the child resolves to
   * `auto` — percentages resolve against the parent's computed `height`, not its used one. The
   * frame then computes to 0, and `contain: layout` makes that zero-height box the containing
   * block for the entire fixed layer, so nothing renders at all while the readiness marker still
   * attests a healthy embed. Measured in Chrome 151 on a real host page.
   *
   * Refusing rather than only warning is the point: before #169 that same host got the compact
   * card — a working button and the right advice — so leaving it invisible would be a
   * regression. jsdom reports 0 for every `offsetHeight`, which is exactly this condition.
   */
  it('refuses the frame and renders its children uncontained', () => {
    const wrapper = mount(
      <MapFrame contained>
        <span>{CHILD}</span>
      </MapFrame>,
    )

    // The children are the whole point of the fallback: they must still render, resolving
    // against the viewport the way an unsized map embed always has.
    expect(wrapper.textContent).toContain(CHILD)
    expect(wrapper.querySelector('[data-sy-frame]')).toBeNull()
    // And nothing may be left holding the singleton, or every portal in the app follows it into
    // a box with no height.
    expect(frameElement()).toBeNull()
    expect(overlayContainer()).toBe(wrapper)
  })
})

/**
 * Give the frame a box, because jsdom performs no layout and reports `offsetHeight === 0` for
 * every element — which is precisely the "cannot be filled" condition the component refuses.
 *
 * Stubbing it is not a workaround; it is the spec being explicit that these cases are about a
 * frame that DID get a box, and the describe above is about one that did not.
 */
function withLayout() {
  const descriptors = {
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  }

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 640 })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1024 })
  })

  afterEach(() => {
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor)
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]
    }
  })
}

describe('MapFrame, contained', () => {
  withLayout()

  it('takes the containing block with contain:layout, and marks itself for the CSS', () => {
    // `contain: layout` is the whole mechanism: it makes this the containing block for every
    // fixed descendant — the canvas, the drawers, the peek strips — with no `fixed` →
    // `absolute` swap anywhere. `data-sy-frame` is what switches `--sy-frame-h` to `100%`.
    const wrapper = mount(
      <MapFrame contained>
        <span>{CHILD}</span>
      </MapFrame>,
    )
    const frame = wrapper.querySelector('[data-sy-frame]')

    expect(frame).not.toBeNull()
    expect(frame?.className).toContain('[contain:layout]')
    // The host's own height is what the widget fills, exactly as in `map=false`.
    expect(frame?.className).toContain('h-full')
    expect(wrapper.textContent).toContain(CHILD)
  })

  it('publishes itself as the frame and the portal target', () => {
    const wrapper = mount(
      <MapFrame contained>
        <span>{CHILD}</span>
      </MapFrame>,
    )
    const frame = wrapper.querySelector('[data-sy-frame]')

    // Both, and they are different questions: `frameElement()` is the box vaul measures and
    // `--sy-sheet-top` subtracts, `overlayContainer()` is where every drawer portals. A frame
    // that took only the first would contain the map and leave its drawers on the viewport.
    expect(frameElement()).toBe(frame)
    expect(overlayContainer()).toBe(frame)
  })

  it('is published BEFORE its children first render', () => {
    // ⚠ The timing constraint, and the reason the node is held in state rather than a ref.
    // `overlayContainer()` is read in render bodies (the drawer's portal target, vaul's
    // measurement box, the widget's own width), so a ref alone would be one commit late: the
    // first drawer would portal itself beside the frame, resolve `fixed` against the viewport,
    // and paint over the host's page — the exact failure containment exists to prevent.
    const seen: (HTMLElement | undefined)[] = []
    const wrapper = mount(
      <MapFrame contained>
        <Probe seen={seen} />
      </MapFrame>,
    )
    const frame = wrapper.querySelector('[data-sy-frame]')

    expect(seen.length).toBeGreaterThan(0)
    // EVERY render, not just the last: a child that saw the theme root once has already
    // portaled there.
    expect(seen.every((container) => container === frame)).toBe(true)
  })

  it('releases the frame on unmount', () => {
    // A frame left standing after its subtree is gone swallows every portal in the app into a
    // detached node.
    const wrapper = mount(
      <MapFrame contained>
        <span>{CHILD}</span>
      </MapFrame>,
    )

    cleanup?.()
    cleanup = null

    expect(frameElement()).toBeNull()
    expect(overlayContainer()).toBe(wrapper)
  })
})

/**
 * The JOIN, pinned in source.
 *
 * `CLAUDE.md § Testing` records the `timeoutStatus` lesson twice over: a helper can be
 * exhaustively specced, return the right answer, and never be wired to its caller — and no pure
 * spec can see that. Everything above proves `MapFrame` works; none of it proves the map is
 * inside one. Rendering `FullInterface` here to close that gap is not an option: it imports
 * `react-map-gl`, whose `exports-mapbox.js` fires `import('mapbox-gl')` at module scope, which
 * is precisely what the node lane must never pull in.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

describe('the wiring', () => {
  it('is what FullInterface wraps the map and the drawer stack in', () => {
    const source = read('views/FullInterface.tsx')

    expect(source).toMatch(/<MapFrame contained=\{contained\}>/)
    // Inside it, not beside it — a frame whose siblings are the fixed layer contains nothing.
    const frame = source.slice(source.indexOf('<MapFrame'), source.indexOf('</MapFrame>'))

    expect(frame).toContain('<Mapbox />')
    expect(frame).toContain('<DrawerStack />')
  })
})

/**
 * `data-sy-frame` is the whole JS↔CSS contract — it is what switches `--sy-frame-h` from
 * `100dvh` to `100%` — and it is a bare literal in three files that no type connects.
 *
 * The repo has the precedent and the scar: `WIDGET_SCOPE_CLASS` (`lib/scope.ts`) is pinned
 * across its four copies by `postcss-scope-widget.test.ts` because that class had drifted. Here
 * a rename or a typo would break ONE of the two frames and leave the other working, with lint,
 * typecheck and the rest of the lane green.
 */
describe('the data-sy-frame contract', () => {
  const ATTRIBUTE = 'data-sy-frame'

  it('is emitted by both frames', () => {
    expect(read('views/MapFrame.tsx')).toContain(`${ATTRIBUTE}=""`)
    // The compact card's expanded dialog is the other one. It also carries `data-sy-expanded`,
    // which is deliberately NARROWER — dialog-only, for the Mapbox control-column nudge.
    expect(read('views/CompactEmbedView/CompactEmbedView.tsx')).toContain(`${ATTRIBUTE}=""`)
  })

  it('is what the stylesheet keys the frame height off', () => {
    const css = readFileSync(join(SRC, 'styles/globals.css'), 'utf8')

    expect(css).toMatch(new RegExp(`\\[${ATTRIBUTE}\\]\\s*\\{[^}]*--sy-frame-h:\\s*100%`))
    // And the fallback it overrides, so a deleted token is not mistaken for a passing test.
    expect(css).toMatch(/--sy-frame-h:\s*100dvh/)
  })
})
