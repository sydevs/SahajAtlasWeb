import selectorParser from 'postcss-selector-parser'

/**
 * PostCSS pass that confines every rule this repo emits to the widget's own DOM.
 *
 * WHY (issue #91): the widget has no shadow boundary — `vite-plugin-css-injected-by-js`
 * appends our whole stylesheet to the HOST document's <head>, after the host's own
 * sheets, so it wins ties. Anything left at top level restyles the page we are a guest
 * on: Tailwind's Preflight reset (`a { color: inherit }`, zeroed heading/list margins,
 * `border: 0` on `*`, form-control resets), every generated utility (`.container`,
 * `.hidden`, `.sr-only`), the `:root`/`.dark` palette blocks, and the whole of
 * mapbox-gl.css / swiper / vaul / Radix Colors, which we inline by `@import`.
 *
 * Hand-scoping every selector was the old rule (`.claude/rules/components.md`) and it
 * had already leaked twice (a bare `main {}`, a `.swiper-pagination-bullet {}`), because
 * a leak is invisible: lint, typecheck and the unit lane all stay green while a host
 * page silently changes. So the invariant is mechanical instead — this runs LAST in
 * `postcss.config.js`, after Tailwind has generated and after Vite has inlined the
 * `@import`s, and it refuses to emit a stylesheet that still has an unscoped selector.
 *
 * Two things are rewritten:
 *
 *   1. Selectors → `.sy-atlas :is(<selector>)`. `:is()` matters: the plain descendant
 *      form `.sy-atlas .dark .text-white` would demand a `.dark` element *inside* the
 *      scope, but `.dark` (and `dir`, which drives the rtl: variants) sit on the scope
 *      element ITSELF. Wrapped, the same element can satisfy both halves. Selectors
 *      that address the root — `:root`, `html`, `body`, `:host`, and a bare theme class
 *      like `.dark` (Radix Colors ships one) — map onto the scope element instead of
 *      under it. Anything already written against `.sy-atlas` is passed through, which
 *      is the escape hatch for hand-written rules that must target the root.
 *
 *   2. `@keyframes` names → `sy-atlas-<name>`. Keyframe names are document-global and
 *      last-definition-wins, so shipping a bare `@keyframes fadeIn` (vaul does) or
 *      `spin`/`pulse` (Tailwind does) hijacks any host animation of that name. The
 *      declarations that reference them are rewritten in the same pass.
 *
 * The scope class is put on the widget's theme-root wrapper (`src/Widget.tsx`), on
 * `<html>` for the standalone build (`index.html`), and on `<html>` by the Ladle
 * decorator. Keep it in sync with `WIDGET_SCOPE_CLASS` in `src/lib/scope.ts`.
 */
export const WIDGET_SCOPE = 'sy-atlas'

// Selectors that address the document root. Inside the widget there is no document to
// own — the theme-root wrapper plays that part — so these collapse onto the scope class
// rather than nesting under it. `:host` appears in Tailwind 3.4's Preflight (`html, :host`).
const ROOT_SELECTORS = new Set([':root', 'html', 'body', ':host'])

// The light/dark classes live on the SAME element as the scope class (the theme root),
// so a rule whose whole selector is one of them has to compound, not descend. Radix
// Colors' dark files are exactly this shape (`.dark, .dark-theme { --gray-1: … }`), and
// so are our own brand-default blocks in globals.css.
const THEME_CLASSES = new Set(['light', 'light-theme', 'dark', 'dark-theme'])

const COMBINATORS = new Set(['combinator'])

/** Is this node a `::pseudo-element` (as opposed to a `:pseudo-class`)? */
function isPseudoElement(node) {
  if (node.type !== 'pseudo') return false

  // `::before` and the legacy one-colon `:before` / `:after` / `:first-line` /
  // `:first-letter` forms, plus vendor pseudo-elements like `::-webkit-scrollbar`.
  return node.value.startsWith('::') || /^:(before|after|first-line|first-letter)$/.test(node.value)
}

/**
 * Prefix one selector so it can only match inside the widget.
 *
 * Pure and exported so the tricky shapes are covered by the unit lane rather than only
 * by eyeballing a built stylesheet.
 *
 * @param {string} selector a single selector (no commas — callers split a list first)
 * @param {string} scope the scope class name, without the leading dot
 * @returns {string}
 */
export function scopeSelector(selector, scope = WIDGET_SCOPE) {
  const root = selectorParser().astSync(selector)
  const sel = root.first

  if (!sel || sel.nodes.length === 0) return selector

  const first = sel.nodes[0]

  // Already scoped by hand (`.sy-atlas`, `.sy-atlas.dark`, `.sy-atlas .foo`) — leave it.
  if (first.type === 'class' && first.value === scope) return selector

  // A root selector, alone or leading a compound (`html.dark`, `body > .foo`): swap the
  // root token for the scope class in place.
  if (
    (first.type === 'tag' || first.type === 'pseudo') &&
    ROOT_SELECTORS.has(first.type === 'tag' ? first.value : first.value.toLowerCase())
  ) {
    first.replaceWith(selectorParser.className({ value: scope }))

    return root.toString()
  }

  // A bare theme class — compound onto the scope element, which is where it lives.
  if (sel.nodes.length === 1 && first.type === 'class' && THEME_CLASSES.has(first.value)) {
    return `.${scope}${selector}`
  }

  const hasCombinator = sel.nodes.some((node) => COMBINATORS.has(node.type))

  // No combinator: a plain descendant prefix already says everything `:is()` would, and
  // keeps the output readable (and shorter — this is most of the stylesheet).
  if (!hasCombinator) return `.${scope} ${selector}`

  // With a combinator the selector has to be wrapped so its own ancestor parts can be
  // satisfied BY the scope element. Trailing pseudo-elements move outside the wrapper:
  // `:is(.a > .b::before)` is invalid CSS, `:is(.a > .b)::before` is what was meant.
  const trailing = []

  while (sel.nodes.length > 1 && isPseudoElement(sel.nodes[sel.nodes.length - 1])) {
    const node = sel.nodes[sel.nodes.length - 1]

    trailing.unshift(node.toString())
    node.remove()
  }

  return `.${scope} :is(${sel.toString().trim()})${trailing.join('')}`
}

/** Does this selector already sit inside the widget scope? */
export function isSelectorScoped(selector, scope = WIDGET_SCOPE) {
  return new RegExp(`^\\.${scope}(?![\\w-])`).test(selector.trim())
}

/** Rules inside `@keyframes` are `from`/`to`/`50%` — not selectors, never prefixed. */
function isKeyframeStep(rule) {
  return rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)
}

/**
 * Rename every `@keyframes` in the sheet and rewrite the declarations that use them.
 * Two passes, because a keyframe may be defined after its first use.
 */
function namespaceKeyframes(root, scope) {
  /** @type {Map<string, string>} */
  const renamed = new Map()

  root.walkAtRules(/^(-\w+-)?keyframes$/i, (atRule) => {
    const name = atRule.params.trim()

    if (name.startsWith(`${scope}-`)) return

    const scoped = `${scope}-${name}`

    renamed.set(name, scoped)
    atRule.params = scoped
  })

  if (renamed.size === 0) return

  // Whole-word replacement, so `animation: 0.5s slideFromBottom` and
  // `animation-name: fadeIn, fadeOut` both land, and a name that merely appears as a
  // substring of another token does not.
  const pattern = new RegExp(
    `(^|[\\s,])(${[...renamed.keys()].map(escapeRegExp).join('|')})(?=$|[\\s,])`,
    'g',
  )

  root.walkDecls(/^(-\w+-)?animation(-name)?$/i, (decl) => {
    decl.value = decl.value.replace(pattern, (_match, lead, name) => `${lead}${renamed.get(name)}`)
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A rule nested inside another rule (native CSS nesting) is already covered by its
 * parent's prefix, and `:is(> .a)` — what prefixing a relative selector would produce —
 * is invalid CSS that browsers drop silently.
 */
function isNested(rule) {
  return rule.parent?.type === 'rule'
}

/** Rules this pass is responsible for: everything but keyframe steps and nested rules. */
function isScopeable(rule) {
  return !isKeyframeStep(rule) && !isNested(rule)
}

/**
 * Throw unless every top-level selector in the sheet is confined to the scope.
 *
 * Exported so the safety net itself is covered by the unit lane: it exists for the
 * shapes `scopeSelector` fails to handle, which by definition can't be reached through
 * the transform. Without it such a shape would ship as a silent host-page leak — the
 * exact failure mode this whole pass exists to end.
 *
 * @param {import('postcss').Root} root
 * @param {string} [scope]
 */
export function assertScoped(root, scope = WIDGET_SCOPE) {
  root.walkRules((rule) => {
    if (!isScopeable(rule)) return

    const leaked = rule.selectors.filter((selector) => !isSelectorScoped(selector, scope))

    if (leaked.length > 0) {
      throw rule.error(`unscoped selector would leak into the host page: ${leaked.join(', ')}`, {
        plugin: 'scope-widget-css',
      })
    }
  })
}

/**
 * @param {{ scope?: string }} [options]
 * @returns {import('postcss').Plugin}
 */
export default function scopeWidgetCss(options = {}) {
  const scope = options.scope ?? WIDGET_SCOPE

  return {
    postcssPlugin: 'scope-widget-css',
    OnceExit(root, { result }) {
      namespaceKeyframes(root, scope)

      root.walkRules((rule) => {
        if (!isScopeable(rule)) return

        rule.selectors = rule.selectors.map((selector) => scopeSelector(selector, scope))
      })

      // Belt and braces: prove the pass did what it claims before the bytes leave the
      // build.
      assertScoped(root, scope)

      result.messages.push({ type: 'scope-widget-css', plugin: 'scope-widget-css', scope })
    },
  }
}

scopeWidgetCss.postcss = true
