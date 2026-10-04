// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

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
 * The spec stays node-only in its sibling because that file reads itself off disk, which
 * jsdom's `import.meta.url` cannot do.
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
