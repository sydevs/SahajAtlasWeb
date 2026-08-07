import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import postcss from 'postcss'

import { WIDGET_SCOPE_CLASS } from '../src/lib/scope'

import scopeWidgetCss, {
  THEME_CLASSES,
  WIDGET_SCOPE,
  assertScoped,
  isSelectorScoped,
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

  it('hoists a pseudo-element together with the pseudo-classes that qualify it', () => {
    // `:hover` binds to the pseudo-element, not the compound, so stopping at the first
    // pseudo-class would strand the `::` inside the wrapper and kill the rule.
    expect(scopeSelector('.a .b::-webkit-scrollbar-thumb:hover')).toBe(
      ':where(.sy-atlas) :is(.a .b)::-webkit-scrollbar-thumb:hover',
    )
  })

  it('refuses shapes whose :is() body would be invalid, instead of emitting a dead rule', () => {
    // `:is()` is a FORGIVING selector list: an invalid body doesn't throw and doesn't
    // fail the prefix check — the rule just silently matches nothing. That is the same
    // failure class this pass exists to end, pointed inward, so it has to be loud.
    expect(() => scopeSelector('.a::before + .b')).toThrow(/silently match nothing/)
    expect(() => scopeSelector('.a > ::before')).toThrow(/silently match nothing/)
  })

  it('does not mistake an escaped variant class for a pseudo-element', () => {
    // Tailwind emits `.before\:content-\[\'\'\]` — a class whose NAME contains "before".
    // A text-based validity check fired on it and broke the build.
    expect(scopeSelector(String.raw`.dark .before\:underline`)).toBe(
      String.raw`:where(.sy-atlas) :is(.dark .before\:underline)`,
    )
  })

  it('collapses only a BARE root pseudo, so :host(...) keeps its condition', () => {
    // Replacing the node wholesale would drop `(.theme)` and the rule would over-match.
    expect(scopeSelector(':host(.theme) .a')).toBe(':where(.sy-atlas) :is(:host(.theme) .a)')
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

  it('refuses to rename a keyframe named after an animation keyword', async () => {
    // The rename is a token substitution over the `animation` shorthand, so
    // `@keyframes ease` would rewrite the timing function and leave the animation
    // nameless. Fail loudly rather than corrupt the value.
    await expect(
      run('@keyframes ease { to { opacity: 1 } } .x { animation: 1s ease }'),
    ).rejects.toThrow(/animation keyword/)
  })

  it('skips a rule nested any depth inside another rule', async () => {
    const css = await run('.a { @media (min-width: 40rem) { & > .b { color: red } } }')

    expect(css).toContain(':where(.sy-atlas) .a')
    expect(css).not.toContain(':is(>')
  })

  it('refuses to emit a stylesheet that could still restyle the host page', () => {
    // The safety net for shapes the transform fails to handle — unreachable through
    // the transform itself, so it is asserted directly.
    expect(() => assertScoped(postcss.parse('a { color: red }'))).toThrow(/not confined/)
    expect(() => assertScoped(postcss.parse('.sy-atlas a { color: red }'))).not.toThrow()
  })
})

// Why the head of the string stopped being sufficient: see the `isSelectorScoped`
// docblock. What matters here is that the two accepted shapes below are the emitted
// forms, verbatim from `dist/` — copied off a real build rather than imagined, since the
// point of failure was a mismatch between what we assumed the bytes looked like and what
// they were (issue #104).
describe('isSelectorScoped — flattened nesting', () => {
  it('accepts a leading :is() list when every branch is scoped', () => {
    expect(
      isSelectorScoped(
        ':is(:where(.sy-atlas) .swiper:not(.swiper-watch-progress),' +
          ':where(.sy-atlas) :is(.swiper-watch-progress .swiper-slide-visible))' +
          ' .swiper-lazy-preloader',
      ),
    ).toBe(true)
  })

  it('accepts the scope in the SUBJECT, which no head-anchored test can', () => {
    // `.swiper-pagination { .swiper-pagination-disabled > & { … } }` flattens to this.
    // The element being styled is the scoped one; its ancestor is not, and needn't be.
    expect(
      isSelectorScoped('.swiper-pagination-disabled>:is(:where(.sy-atlas) .swiper-pagination)'),
    ).toBe(true)
    expect(isSelectorScoped('button:is(:where(.sy-atlas) .swiper-pagination-bullet)')).toBe(true)
  })

  it('rejects an :is() list with even one unscoped branch', () => {
    // The branch that isn't scoped is a way for the rule to match outside the widget,
    // which is the whole thing this gate exists to prevent.
    expect(isSelectorScoped(':is(:where(.sy-atlas) .a, .b) .c')).toBe(false)
  })

  it('still rejects a selector that merely mentions no scope at all', () => {
    expect(isSelectorScoped('.swiper-pagination-bullet')).toBe(false)
    expect(isSelectorScoped('main > .a')).toBe(false)
    // A class that only starts with the scope's text is a different class.
    expect(isSelectorScoped('.sy-atlas-thing .a')).toBe(false)
  })

  it('does not follow a sibling combinator up to a scoped compound', () => {
    // `+`/`~` put the scoped part BESIDE the subject, not above it. Nothing we emit
    // needs it, so it is refused rather than reasoned about.
    expect(isSelectorScoped(':is(:where(.sy-atlas) .a) ~ .b')).toBe(false)
  })
})

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// The scope class is agreed between this build-time pass and the runtime, and a mismatch
// is invisible to every other gate: the CSS still builds, lint and typecheck pass, and
// the widget simply renders with no styles at all on a host page.
describe('agreement with the runtime', () => {
  it('uses the same class the app puts on the theme root', () => {
    expect(WIDGET_SCOPE).toBe(WIDGET_SCOPE_CLASS)
  })

  it('is applied inline by the embedded widget, for a styled first paint', () => {
    expect(read('src/Widget.tsx')).toContain('WIDGET_SCOPE_CLASS')
  })

  it('is on <html> for the two builds with no widget wrapper', () => {
    expect(read('index.html')).toMatch(new RegExp(`<html[^>]*class="[^"]*${WIDGET_SCOPE}`))
    expect(read('.ladle/components.tsx')).toContain('classList.add(WIDGET_SCOPE_CLASS)')
  })

  it('is never written to whatever getThemeRoot() happens to return', () => {
    // It would look natural in `applyTheme` — the class belongs on the theme root, which
    // that function owns. But `getThemeRoot()` falls back to `document.documentElement`,
    // and BrandTheme releases the module-level root on unmount, so with two embeds on one
    // page the survivor's next theme write would stamp the scope onto the HOST page's
    // <html> and apply the entire widget stylesheet to their site.
    expect(read('src/hooks/use-theme.ts')).not.toContain('classList.add(WIDGET_SCOPE_CLASS)')
  })

  // Half of THEME_CLASSES is ours: the classes applyTheme writes. A rule whose whole
  // selector is one of them must COMPOUND onto the scope element rather than descend from
  // it, so a renamed theme class silently turns the palette block into a selector that
  // matches nothing — with every gate still green.
  it('compounds the theme classes the theme machinery actually writes', () => {
    const written = [
      ...read('src/hooks/use-theme.ts').matchAll(/^ {2}(light|dark): '([\w-]+)',$/gm),
    ].map((m) => m[2])

    expect(written).toHaveLength(2)
    for (const cls of written) expect(THEME_CLASSES.has(cls)).toBe(true)
  })

  it('keeps the Radix Colors pair, which ships those names in its own files', () => {
    expect(THEME_CLASSES.has('light-theme')).toBe(true)
    expect(THEME_CLASSES.has('dark-theme')).toBe(true)
  })
})
