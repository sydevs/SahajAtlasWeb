import selectorParser from 'postcss-selector-parser'

/**
 * A PostCSS pass that confines every rule this repo emits to the widget's
 * own DOM.
 *
 * WHY (issue #91): the widget has no shadow boundary.
 * `vite-plugin-css-injected-by-js` appends our whole stylesheet to the
 * HOST document's `<head>`, after the host's own sheets, so it wins style
 * ties. Anything left at the top level restyles the page we are a guest
 * on. That includes Tailwind's Preflight reset (`a { color: inherit }`,
 * zeroed heading and list margins, `border: 0` on `*`, form-control
 * resets), every generated utility (`.container`, `.hidden`, `.sr-only`),
 * the `:root`/`.dark` palette blocks, and the whole of mapbox-gl.css,
 * swiper, vaul, and Radix Colors, which we inline by `@import`.
 *
 * Hand-scoping every selector was the old rule (`src/components/AGENTS.md`),
 * and it had already leaked twice: a bare `main {}`, and a
 * `.swiper-pagination-bullet {}`. A leak is invisible. Lint, typecheck, and
 * the unit lane all stay green while a host page silently changes. So the
 * invariant is now mechanical instead. This pass runs LAST in
 * `postcss.config.js`, after Tailwind has generated its output and Vite
 * has inlined the `@import`s. It refuses to emit a stylesheet that still
 * has an unscoped selector.
 *
 * This pass rewrites two things:
 *
 *   1. Selectors → `:where(.sy-atlas) :is(<selector>)`. `:is()` matters
 *      here. The plain descendant form `.sy-atlas .dark .text-white`
 *      would demand a `.dark` element *inside* the scope. But `.dark`
 *      (and `dir`, which drives the `rtl:` variants) sit on the scope
 *      element ITSELF. Wrapped this way, one element satisfies both
 *      halves. Selectors that address the root — `:root`, `html`,
 *      `body`, `:host`, and a bare theme class like `.dark` (Radix
 *      Colors ships one) — map onto the scope element instead of under
 *      it. Anything already written against `.sy-atlas` passes through
 *      untouched. That is the escape hatch for hand-written rules that
 *      must target the root.
 *
 *   2. `@keyframes` names → `sy-atlas-<name>`. Keyframe names are
 *      document-global, and the last definition wins. So shipping a bare
 *      `@keyframes fadeIn` (vaul does this) or `spin`/`pulse` (Tailwind
 *      does) would hijack any host animation of that name. This pass
 *      rewrites the declarations that reference them in the same step.
 *
 * The scope class sits on the widget's theme-root wrapper
 * (`src/Widget.tsx`), on `<html>` for the standalone build (`index.html`),
 * and on `<html>` from the Ladle decorator. Keep it in sync with
 * `WIDGET_SCOPE_CLASS` in `src/lib/scope.ts`.
 */
export const WIDGET_SCOPE = 'sy-atlas'

// Selectors that address the document root. Inside the widget there is no
// document to own — the theme-root wrapper plays that part. So these
// collapse onto the scope class, instead of nesting under it. `:host`
// appears in Tailwind 3.4's Preflight (`html, :host`).
const ROOT_SELECTORS = new Set([':root', 'html', 'body', ':host'])

// The light and dark classes live on the SAME element as the scope class,
// the theme root. So a rule whose whole selector is one of them must
// compound onto the scope, not descend from it. Radix Colors' dark files
// use exactly this shape (`.dark, .dark-theme { --gray-1: … }`), and so do
// our own brand-default blocks in globals.css.
//
// `light` and `dark` are OURS — the classes `applyTheme` writes
// (src/hooks/use-theme.ts). `light-theme` and `dark-theme` come from Radix
// Colors. This set is exported so the spec can pin the first pair against
// the theme module. Rename a theme class without updating this set, and
// the palette block silently descends instead of compounding, with no
// other gate to catch it.
export const THEME_CLASSES = new Set(['light', 'light-theme', 'dark', 'dark-theme'])

// One parser instance for the whole run. `selectorParser()` builds a
// fresh Processor on every call. This pass runs once per selector, across
// a few thousand selectors per build, and again on every dev-server CSS
// edit.
const parser = selectorParser()

/**
 * The prefix, wrapped in `:where()` so it contributes ZERO specificity.
 *
 * This choice is load-bearing, not tidiness. A bare `.sy-atlas` prefix
 * would raise every rule in the sheet by one class, including Tailwind's
 * Preflight. That would then outrank third-party CSS a library injects
 * into the document at RUNTIME — CSS this pass never sees, and so never
 * lifts to match. It once broke the Mapbox geocoder. Scoped Preflight
 * `.sy-atlas input` (specificity 0,1,1) beat Mapbox's own
 * `.mbx…--Input { padding: 0 40px }` (specificity 0,1,0). The input lost
 * its padding, and the search icon sat on top of the placeholder. With
 * `:where()`, every rule keeps exactly the specificity it had. So the
 * cascade inside the widget stays unchanged, and only the REACH of each
 * selector narrows. That reach is all this pass is for.
 */
const prefix = (scope) => `:where(.${scope})`

/**
 * Prefixes one selector so it can only match inside the widget.
 *
 * This function is pure and exported, so the unit lane covers the tricky
 * shapes directly, rather than only by eyeballing a built stylesheet.
 *
 * @param {string} selector a single selector (no commas — callers split a list first)
 * @param {string} scope the scope class name, without the leading dot
 * @returns {string}
 */
export function scopeSelector(selector, scope = WIDGET_SCOPE) {
  // A selector already scoped by hand (`.sy-atlas`, `.sy-atlas.dark`,
  // `.sy-atlas .foo`) is left as is, before this function pays for a
  // parse. A hand-written scope selector keeps its real specificity on
  // purpose. It is ours, and it is meant to beat the collapsed `:root`
  // blocks it sits alongside.
  if (isSelectorScoped(selector, scope)) return selector

  const root = parser.astSync(selector)
  const sel = root.first

  if (!sel || sel.nodes.length === 0) return selector

  const first = sel.nodes[0]

  // A root selector, alone or leading a compound (`html.dark`, `body >
  // .foo`), gets its root token swapped for the scope, which is the root
  // of the widget's world. Only a BARE root token qualifies. A functional
  // `:host(.theme)` carries a condition that dropping the node would
  // discard, leaving a rule that over-matches inside the widget. That
  // case falls through to the ordinary prefixing below instead.
  if (
    (first.type === 'tag' || first.type === 'pseudo') &&
    ROOT_SELECTORS.has(first.type === 'tag' ? first.value : first.value.toLowerCase()) &&
    (first.type === 'tag' || first.nodes === undefined || first.nodes.length === 0)
  ) {
    const rest = sel.nodes.slice(1).join('')

    return `${prefix(scope)}${rest}`
  }

  // A bare theme class compounds onto the scope element, which is where it lives.
  if (sel.nodes.length === 1 && first.type === 'class' && THEME_CLASSES.has(first.value)) {
    return `${prefix(scope)}${selector}`
  }

  const hasCombinator = sel.nodes.some(selectorParser.isCombinator)

  // With no combinator, a plain descendant prefix already says everything
  // `:is()` would, and it keeps the output shorter and more readable.
  // This covers most of the stylesheet.
  if (!hasCombinator) return `${prefix(scope)} ${selector}`

  // With a combinator, this function must wrap the selector so its own
  // ancestor parts can be satisfied BY the scope element. Pseudo-elements
  // move outside the wrapper: `:is(.a > .b::before)` is invalid CSS,
  // while `:is(.a > .b)::before` says what was meant. The walk below
  // carries along any pseudo-CLASS that qualifies a pseudo-element
  // (`::-webkit-scrollbar-thumb:hover`), since those bind to the
  // pseudo-element, not to the compound. Stopping at the first
  // pseudo-class would leave the `::` stuck inside the wrapper.
  const trailing = []

  while (sel.nodes.length > 1) {
    const node = sel.nodes[sel.nodes.length - 1]

    if (node.type !== 'pseudo') break

    const isElement = selectorParser.isPseudoElement(node)

    // A pseudo-CLASS comes along only when it qualifies a pseudo-element
    // further left in the same compound. Otherwise it belongs to the
    // compound, and it stays inside the wrapper.
    if (!isElement && !qualifiesPseudoElement(sel)) break

    trailing.unshift(node.toString())
    node.remove()

    if (isElement) break
  }

  const body = sel.toString().trim()

  // A pseudo-element left inside the wrapper, or a body ending in a
  // combinator, would produce a rule that parses but matches NOTHING. The
  // forgiving `:is()` list swallows that error. It neither throws, nor
  // trips the prefix check in `assertScoped`. That is a silently dead
  // rule — the same failure class this pass exists to end, pointed inward
  // instead of outward. This check reads the AST, not the raw text. A
  // string test for `::` or `before` would misfire on Tailwind's own
  // escaped variant classes (`.before\:content-\[\'\'\]`).
  const stillInvalid =
    sel.nodes.some(selectorParser.isPseudoElement) ||
    selectorParser.isCombinator(sel.nodes[sel.nodes.length - 1])

  if (stillInvalid) {
    throw new Error(
      `scope-widget-css: cannot safely wrap "${selector}" — the :is() body would be invalid ("${body}"), and the rule would silently match nothing`,
    )
  }

  return `${prefix(scope)} :is(${body})${trailing.join('')}`
}

/** Is there a pseudo-element further left in this compound, before anything else? */
function qualifiesPseudoElement(sel) {
  for (let i = sel.nodes.length - 2; i >= 0; i -= 1) {
    const node = sel.nodes[i]

    // Anything that is not a pseudo — a combinator, a class, or a tag — ends the run.
    if (node.type !== 'pseudo') return false
    if (selectorParser.isPseudoElement(node)) return true
  }

  return false
}

/**
 * Does this selector only ever style elements inside the widget scope?
 *
 * The cheap answer is a scope token at the HEAD of the string: this
 * pass's own `:where(.sy-atlas)` prefix, or a hand-written `.sy-atlas`
 * selector. That was the whole test until issue #104, and most selectors
 * still take this path.
 *
 * That test is not enough on its own, because THIS PASS IS NOT THE LAST
 * THING TO TOUCH THE SELECTOR. The minifier flattens native CSS nesting
 * downstream of this pass, and flattening moves the scope off the head of
 * the string without moving it out of the selector. Swiper 12 introduced
 * this shape — it dropped its LESS/SCSS sources in favor of nested CSS —
 * and it produced fifteen variants of it, in two families:
 *
 *   .swiper:not(.swiper-watch-progress),                  →  :is(<scoped>, <scoped>)
 *   .swiper-watch-progress .swiper-slide-visible {           .swiper-lazy-preloader
 *     .swiper-lazy-preloader { … } }
 *
 *   .swiper-pagination {                                  →  .swiper-pagination-disabled
 *     .swiper-pagination-disabled > & { … } }                > :is(<scoped>)
 *
 * Both shapes are correctly confined — the element each one STYLES still
 * has to sit inside the widget. So a head-anchored test was failing the
 * build on sound CSS. Look at the second family: no amount of checking
 * the head of the string can accept it, because the scope legitimately
 * lives in the SUBJECT there.
 *
 * So this check asks the real question instead: is the subject — the
 * final compound, the element the rule paints — necessarily inside the
 * scope? That question is what this pass has always existed to answer.
 * The head of the string was only ever a proxy for it.
 *
 * The head match survives as a FAST PATH, but it was never sufficient
 * alone, even before #104. `.sy-atlas ~ .foo` leads with the scope, and
 * it styles a SIBLING of the widget root — an arbitrary host element. A
 * head-anchored test would accept it. Nothing emits that shape today, but
 * a hand-written rule in `globals.css` would pass through untouched AND
 * get waved through the gate. So the fast path now declines any selector
 * carrying a sibling combinator, and it lets the subject walk below
 * decide instead. (`+` also appears inside `:nth-child(2n+1)`, which
 * merely sends a rare selector down the slow path, at no real cost.)
 */
const scopedPatterns = new Map()

/** `~` or `+` anywhere — deliberately over-broad. It only routes. It never decides. */
const MAYBE_SIBLING = /[~+]/

export function isSelectorScoped(selector, scope = WIDGET_SCOPE) {
  const trimmed = selector.trim()

  let pattern = scopedPatterns.get(scope)

  if (!pattern) {
    pattern = new RegExp(`^(:where\\()?\\.${scope}(?![\\w-])`)
    scopedPatterns.set(scope, pattern)
  }

  if (pattern.test(trimmed) && !MAYBE_SIBLING.test(trimmed)) return true

  // Nothing without the class anywhere in it can be confined by it. This
  // check is what spares the TRANSFORM a parse: its input is third-party
  // selectors that never mention the scope. On the ASSERT side, every
  // selector mentions the scope, so the head regex above short-circuits
  // instead, leaving only the flattened shapes to parse.
  if (!trimmed.includes(`.${scope}`)) return false

  return isSubjectConfined(parser.astSync(trimmed).first, scope)
}

/**
 * Scans right-to-left from the subject, and reports whether anything on
 * its ANCESTOR chain pins it inside the scope. Walking backwards visits
 * the subject's own compound first, then the combinator above it, then
 * the next compound up. So the walk stops at the first step that is not
 * an ancestor step.
 *
 * Only the descendant and child combinators count as ancestor steps.
 * Refusing `+` and `~` is NECESSARY here, not fastidious. A bare
 * `.sy-atlas` counts as a scope token, because a descendant of the root
 * is inside the widget. So crediting siblings too would accept
 * `:is(:where(.sy-atlas)) ~ .b`, and a sibling of the scope ROOT is an
 * arbitrary host element. That would be a real leak, and it would ship
 * green.
 */
function isSubjectConfined(sel, scope) {
  if (!sel) return false

  for (let i = sel.nodes.length - 1; i >= 0; i -= 1) {
    const node = sel.nodes[i]

    if (!selectorParser.isCombinator(node)) {
      if (isScopeToken(node, scope)) return true
      continue
    }

    const combinator = node.value.trim() || ' '

    if (combinator !== ' ' && combinator !== '>') return false
  }

  return false
}

/**
 * Does this one node confine its compound to the scope? Either it IS the
 * scope class, or it is an `:is()` or `:where()` whose every branch is
 * scoped.
 *
 * Checking "every" branch is what keeps this widened test a fix, not a
 * hole. One unscoped branch means the rule can still match outside the
 * widget. So `:is(:where(.sy-atlas) .a, .b) .c` is still rejected — the
 * pass's own spec pins that case.
 */
function isScopeToken(node, scope) {
  if (node.type === 'class') return node.value === scope
  if (node.type !== 'pseudo' || !/^:(is|where)$/i.test(node.value)) return false

  return node.nodes?.length > 0 && node.nodes.every((b) => isSelectorScoped(b.toString(), scope))
}

/** Rules inside `@keyframes` are `from`/`to`/`50%` — not selectors, and never prefixed. */
function isKeyframeStep(rule) {
  return rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)
}

// Words that can appear in an `animation` shorthand as something other
// than a name. The rename works as a token substitution over that
// shorthand. So a keyframe actually CALLED one of these words would
// rewrite the wrong token. `@keyframes ease` would turn
// `animation: 1s ease` into `animation: 1s sy-atlas-ease`, losing the
// timing function and leaving the animation nameless. Nothing ships such
// a name today. If one ever appears, this pass fails loudly, rather than
// silently corrupting the value.
const ANIMATION_KEYWORDS = new Set([
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
  'none',
  'forwards',
  'backwards',
  'both',
  'running',
  'paused',
  'infinite',
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'step-start',
  'step-end',
  'initial',
  'inherit',
  'unset',
  'revert',
  'revert-layer',
  'auto',
])

/**
 * Renames every `@keyframes` rule in the sheet. It also rewrites the
 * declarations that use them. This runs in two passes, because a
 * keyframe may be defined after its first use.
 */
function namespaceKeyframes(root, scope) {
  /** @type {Map<string, string>} */
  const renamed = new Map()

  root.walkAtRules(/^(-\w+-)?keyframes$/i, (atRule) => {
    const name = atRule.params.trim()

    if (name.startsWith(`${scope}-`)) return

    if (ANIMATION_KEYWORDS.has(name.toLowerCase())) {
      throw atRule.error(
        `@keyframes ${name} is named after an animation keyword; renaming it would corrupt the shorthand values that use it`,
        { plugin: 'scope-widget-css' },
      )
    }

    const scoped = `${scope}-${name}`

    renamed.set(name, scoped)
    atRule.params = scoped
  })

  if (renamed.size === 0) return

  // This replaces whole words only. `animation: 0.5s slideFromBottom` and
  // `animation-name: fadeIn, fadeOut` both match. A name that merely
  // appears as a substring of another token does not match.
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
 * A rule nested inside another rule, through native CSS nesting, is
 * already covered by its parent's prefix. Prefixing a relative selector
 * would produce `:is(> .a)`, which is invalid CSS. Browsers drop it
 * silently.
 */
function isNested(rule) {
  // This walks the whole ancestor chain, not only the immediate parent. A
  // rule nested inside an `@media` inside a rule still belongs to its
  // outer rule's prefix.
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === 'rule') return true
  }

  return false
}

/** Rules this pass is responsible for: everything except keyframe steps and nested rules. */
function isScopeable(rule) {
  return !isKeyframeStep(rule) && !isNested(rule)
}

/**
 * Throws unless every top-level selector in the sheet is confined to the
 * scope.
 *
 * This function is exported, so the unit lane can cover this safety net
 * directly. It exists for the shapes `scopeSelector` fails to handle,
 * which by definition cannot be reached through the transform alone.
 * Without this check, such a shape would ship as a silent host-page
 * leak — the exact failure mode this whole pass exists to end.
 *
 * @param {import('postcss').Root} root
 * @param {string} [scope]
 * @returns {number} how many rules were checked — so a caller reporting a count does not
 *   need a second walk to get one.
 */
export function assertScoped(root, scope = WIDGET_SCOPE) {
  let checked = 0

  root.walkRules((rule) => {
    if (!isScopeable(rule)) return

    checked += 1

    const leaked = rule.selectors.filter((selector) => !isSelectorScoped(selector, scope))

    if (leaked.length > 0) {
      // There are two ways to reach this line, and the second one is not
      // a bug in the CSS. A selector can also be a shape
      // `isSubjectConfined` declines to reason about — a scope reached
      // across a sibling combinator is the one that exists today, and
      // `swiper/css/navigation` would produce it. Saying so is worth the
      // words: issue #104 was a day spent looking for a leak that a
      // flattened-but-confined selector did not actually have.
      throw rule.error(
        `selector is not confined to the host-page scope — either it would leak, or it is ` +
          `a shape this check declines to credit (see isSubjectConfined): ${leaked.join(', ')}`,
        { plugin: 'scope-widget-css' },
      )
    }
  })

  return checked
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

      // This is a backstop. It proves the pass did what it claims, before
      // the bytes leave the build.
      assertScoped(root, scope)

      result.messages.push({ type: 'scope-widget-css', plugin: 'scope-widget-css', scope })
    },
  }
}

scopeWidgetCss.postcss = true
