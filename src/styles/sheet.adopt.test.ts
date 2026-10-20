// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SINK_KEY, adoptStyles } from './sheet'

/**
 * `adoptStyles` driven, rather than read as text.
 *
 * Its sibling `sheet.test.ts` pins the seam between this module and the stringified sink in
 * `vite.config.ts`, which has to be a source read. The assertions here cannot be: a chunk
 * arriving AFTER a root has adopted is the entire reason `listeners` exists, and no string
 * check can go red for it. jsdom, because constructable stylesheets and
 * `adoptedStyleSheets` are the subject.
 *
 * The sibling stays node-only because nothing in it needs a DOM.
 */

type Sink = { chunks: { id: string | null; css: string }[]; listeners: (() => void)[] }

beforeEach(() => {
  delete (globalThis as unknown as Record<string, unknown>)[SINK_KEY]
  document.body.innerHTML = ''
})

/** The build's own write into the sink, in the shape `sheet.test.ts` pins. */
function inject(css: string) {
  const scope = globalThis as unknown as Record<string, Sink>
  const live = (scope[SINK_KEY] ??= { chunks: [], listeners: [] })

  live.chunks.push({ id: null, css })
  live.listeners.forEach((listener) => listener())
}

// ⚠ jsdom 27 constructs a `CSSStyleSheet` and accepts an `adoptedStyleSheets` assignment,
// but provides no default empty list on a root — so the seed is the environment's gap, not
// part of the contract. A real engine answers `[]` here. `adoptStyles` reads the property
// unguarded, which is right: it is Baseline everywhere the widget ships.
function seed(root: DocumentOrShadowRoot) {
  root.adoptedStyleSheets = []

  return root
}

function openRoot() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  return seed(host.attachShadow({ mode: 'open' }))
}

const rules = (root: DocumentOrShadowRoot) =>
  root.adoptedStyleSheets
    .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
    .join(' ')

describe('adoptStyles', () => {
  it('carries a chunk that arrives after the root adopted', () => {
    const root = openRoot()

    inject('.a { color: red; }')
    adoptStyles(root)

    expect(rules(root)).toContain('red')

    // The lazy route chunk: `relativeCSSInjection` lands it when its chunk is imported,
    // long after this root adopted anything. Without the listener it never arrives.
    inject('.b { color: blue; }')

    expect(rules(root)).toContain('blue')
  })

  it('keeps a sheet the root already had, ahead of ours', () => {
    const root = openRoot()
    const foreign = new CSSStyleSheet()

    foreign.replaceSync('.host { color: green; }')
    root.adoptedStyleSheets = [foreign]

    inject('.a { color: red; }')
    adoptStyles(root)

    expect(root.adoptedStyleSheets[0]).toBe(foreign)
    expect(root.adoptedStyleSheets).toHaveLength(2)
  })

  it('adopts into a document too, which is the standalone shell', () => {
    inject('.a { color: red; }')
    adoptStyles(seed(document))

    expect(rules(document)).toContain('red')
  })
})

describe('adoptStyles — @property registrations', () => {
  const REGISTERED = '@property --tw-x{syntax:"*";inherits:false;initial-value:solid}'

  // The engine ignores an `@property` rule inside a shadow root, so a sheet adopted there
  // registers nothing, and every Tailwind border and shadow computes to `none` (#243's
  // regression). What this pins is where the registrations end up, since jsdom applies none
  // of them either way.
  it('registers a shadow root’s @property rules on the document, and nothing else', () => {
    seed(document)
    const root = openRoot()

    inject(`${REGISTERED} .a { border-bottom-style: var(--tw-x); }`)
    adoptStyles(root)

    expect(rules(document)).toContain('@property --tw-x')
    expect(rules(document)).not.toContain('.a')
    expect(rules(root)).toContain('.a')
  })

  // ⚠ jsdom's parser drops an `@property` rule that follows another, so the second name
  // cannot be read back out of `cssRules` here. A real engine keeps all 62 the build emits.
  // The text handed to the document sheet is what this module controls, so that is read.
  it('carries a lazy chunk’s registrations in the same document sheet', () => {
    seed(document)
    const root = openRoot()
    const replace = vi.spyOn(CSSStyleSheet.prototype, 'replaceSync')

    inject(REGISTERED)
    adoptStyles(root)
    inject('@property --tw-y{syntax:"*";inherits:false}')

    const sheet = document.adoptedStyleSheets[0]
    const written = replace.mock.calls.filter((_, i) => replace.mock.contexts[i] === sheet).at(-1)

    expect(written?.[0]).toContain('--tw-x')
    expect(written?.[0]).toContain('--tw-y')
    expect(document.adoptedStyleSheets).toHaveLength(1)

    replace.mockRestore()
  })

  it('adds no second sheet when the root IS the document, which registers them itself', () => {
    inject(REGISTERED)
    adoptStyles(seed(document))

    expect(document.adoptedStyleSheets).toHaveLength(1)
  })
})
