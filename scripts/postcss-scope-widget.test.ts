import { describe, expect, it } from 'vitest'
import postcss from 'postcss'

import scopeWidgetCss, {
  WIDGET_SCOPE,
  assertScoped,
  scopeSelector,
} from './postcss-scope-widget.mjs'

const run = async (css: string) =>
  (await postcss([scopeWidgetCss()]).process(css, { from: undefined })).css

describe('scopeSelector', () => {
  it('prefixes a plain selector as a descendant of the scope', () => {
    expect(scopeSelector('.container')).toBe(':where(.sy-atlas) .container')
    expect(scopeSelector('a')).toBe(':where(.sy-atlas) a')
    expect(scopeSelector('*')).toBe(':where(.sy-atlas) *')
    expect(scopeSelector('::before')).toBe(':where(.sy-atlas) ::before')
  })

  it('collapses document-root selectors onto the scope element', () => {
    // There is no document to own inside a widget — the theme-root wrapper plays
    // that part, so Preflight's `html`/`body` and every third-party `:root` block
    // of custom properties land on it and inherit down.
    expect(scopeSelector(':root')).toBe(':where(.sy-atlas)')
    expect(scopeSelector('html')).toBe(':where(.sy-atlas)')
    expect(scopeSelector(':host')).toBe(':where(.sy-atlas)')
    expect(scopeSelector('body')).toBe(':where(.sy-atlas)')
    expect(scopeSelector('html.dark')).toBe(':where(.sy-atlas).dark')
    expect(scopeSelector('body > .x')).toBe(':where(.sy-atlas) > .x')
  })

  it('compounds a bare theme class onto the scope element, not under it', () => {
    // Radix Colors ships `.dark, .dark-theme { --gray-1: … }`, and the theme class
    // sits on the SAME element as the scope class. Descending would never match.
    expect(scopeSelector('.dark')).toBe(':where(.sy-atlas).dark')
    expect(scopeSelector('.light-theme')).toBe(':where(.sy-atlas).light-theme')
    // …but only when the theme class is the whole selector: a `.dark` deeper in a
    // selector is Tailwind's dark variant and must stay a descendant match.
    expect(scopeSelector('.dark .text-white')).toBe(':where(.sy-atlas) :is(.dark .text-white)')
  })

  it('wraps combinator selectors in :is() so the scope element can satisfy both halves', () => {
    // The load-bearing case. `.sy-atlas .dark .x` demands a `.dark` INSIDE the scope,
    // but `.dark` (and `dir`, behind the rtl: variants) is on the scope element itself.
    expect(scopeSelector('.group:hover .group-hover\\:underline')).toBe(
      ':where(.sy-atlas) :is(.group:hover .group-hover\\:underline)',
    )
    expect(scopeSelector('[dir="rtl"] .rtl\\:ml-2')).toBe(
      ':where(.sy-atlas) :is([dir="rtl"] .rtl\\:ml-2)',
    )
  })

  it('hoists trailing pseudo-elements out of the :is() wrapper', () => {
    // `:is(.a > .b::before)` is invalid CSS and the whole rule would be dropped.
    expect(scopeSelector('.a > .b::before')).toBe(':where(.sy-atlas) :is(.a > .b)::before')
    expect(scopeSelector('.a .b::-webkit-scrollbar')).toBe(
      ':where(.sy-atlas) :is(.a .b)::-webkit-scrollbar',
    )
    // No combinator: nothing to wrap, so the pseudo-element stays put.
    expect(scopeSelector('.b::before')).toBe(':where(.sy-atlas) .b::before')
  })

  it('adds no specificity, so the cascade inside the widget is unchanged', () => {
    // Not cosmetic. A bare `.sy-atlas ` prefix lifts every rule by one class, including
    // Preflight — which then outranks CSS a library injects at RUNTIME, that this pass
    // never sees and so never lifts to match. It really happened: scoped Preflight
    // `input { padding: 0 }` beat the Mapbox geocoder's own `.mbx…--Input
    // { padding: 0 40px }` and the search icon landed on top of the placeholder.
    // `:where()` is specificity-zero, so only the REACH of a selector changes.
    for (const selector of ['input', '.container', '.dark', ':root', '.a > .b::before']) {
      expect(scopeSelector(selector).startsWith(':where(.sy-atlas)')).toBe(true)
    }
  })

  it('passes through selectors already written against the scope', () => {
    // The escape hatch for hand-written rules that must address the theme root.
    expect(scopeSelector('.sy-atlas')).toBe('.sy-atlas')
    expect(scopeSelector(':where(.sy-atlas).dark')).toBe(':where(.sy-atlas).dark')
    expect(scopeSelector('.sy-atlas .colored-links a')).toBe('.sy-atlas .colored-links a')
    // A different class that merely starts with the same text is not the scope.
    expect(scopeSelector('.sy-atlas-thing')).toBe(':where(.sy-atlas) .sy-atlas-thing')
  })
})

describe('scopeWidgetCss', () => {
  it('scopes every rule, including inside at-rules', async () => {
    const css = await run('@media (min-width: 40rem) { .x { color: red } }')

    expect(css).toContain(':where(.sy-atlas) .x')
  })

  it('leaves keyframe steps alone but namespaces the animation name', async () => {
    // Keyframe names are document-global and last-definition-wins, so a bare
    // `@keyframes fadeIn` (vaul ships one) hijacks a host page's animation.
    const css = await run(
      '@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } } .x { animation: fadeIn 0.5s ease }',
    )

    expect(css).toContain(`@keyframes ${WIDGET_SCOPE}-fadeIn`)
    expect(css).toContain(`animation: ${WIDGET_SCOPE}-fadeIn 0.5s ease`)
    expect(css).toContain('from {')
  })

  it('rewrites animation-name lists without touching lookalike tokens', async () => {
    const css = await run(
      '@keyframes fade { to { opacity: 1 } } .x { animation-name: fade, other } .y { content: "fade" }',
    )

    expect(css).toContain(`animation-name: ${WIDGET_SCOPE}-fade, other`)
    expect(css).toContain('content: "fade"')
  })

  it('leaves a nested rule to its parent rather than emitting invalid :is(> …)', async () => {
    const css = await run('.a { color: red; & > .b { color: blue } }')

    expect(css).toContain(':where(.sy-atlas) .a')
    expect(css).not.toContain(':is(>')
  })

  it('refuses to emit a stylesheet that could still restyle the host page', () => {
    // The safety net for shapes the transform fails to handle — unreachable through
    // the transform itself, so it is asserted directly.
    expect(() => assertScoped(postcss.parse('a { color: red }'))).toThrow(/unscoped selector/)
    expect(() => assertScoped(postcss.parse('.sy-atlas a { color: red }'))).not.toThrow()
  })
})
