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
 *   1. Selectors → `:where(.sy-atlas) :is(<selector>)`. `:is()` matters: the plain
 *      descendant form `.sy-atlas .dark .text-white` would demand a `.dark` element
 *      *inside* the scope, but `.dark` (and `dir`, which drives the rtl: variants) sit on
 *      the scope element ITSELF. Wrapped, one element satisfies both halves. Selectors
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

// The light/dark classes live on the SAME element as the scope class (the theme root), so
// a rule whose whole selector is one of them has to compound, not descend. Radix Colors'
// dark files are exactly this shape (`.dark, .dark-theme { --gray-1: … }`), and so are our
// own brand-default blocks in globals.css.
//
// `light`/`dark` are OURS — the classes `applyTheme` writes (src/hooks/use-theme.ts);
// `light-theme`/`dark-theme` come from Radix Colors. Exported so the spec can pin the
// first pair against the theme module: rename a theme class without updating this and the
// palette block silently descends instead of compounding, which no other gate would catch.
export const THEME_CLASSES = new Set(['light', 'light-theme', 'dark', 'dark-theme'])

// One parser instance for the whole run — `selectorParser()` builds a fresh Processor per
// call, and this runs once per selector across a few thousand of them per build (and again
// on every dev-server CSS edit).
const parser = selectorParser()

/**
 * The prefix, wrapped in `:where()` so it contributes ZERO specificity.
 *
 * This is load-bearing, not tidiness. A bare `.sy-atlas` prefix raises every rule in the
 * sheet by one class — including Tailwind's Preflight — and that outranks third-party CSS
 * a library injects into the document at RUNTIME, which this pass never sees and so never
 * lifts to match. It broke the Mapbox geocoder: scoped Preflight `.sy-atlas input`
 * (0,1,1) beat Mapbox's own `.mbx…--Input { padding: 0 40px }` (0,1,0), the input lost its
 * padding and the search icon sat on top of the placeholder. With `:where()` every rule
 * keeps exactly the specificity it had, so the cascade inside the widget is unchanged and
 * only the REACH of each selector is narrowed — which is all this pass is for.
 */
const prefix = (scope) => `:where(.${scope})`

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
  // Already scoped by hand (`.sy-atlas`, `.sy-atlas.dark`, `.sy-atlas .foo`) — leave it,
  // before paying for a parse. Hand-written scope selectors keep their real specificity
  // on purpose: they are ours, and are meant to beat the collapsed `:root` blocks they
  // sit alongside.
  if (isSelectorScoped(selector, scope)) return selector

  const root = parser.astSync(selector)
  const sel = root.first

  if (!sel || sel.nodes.length === 0) return selector

  const first = sel.nodes[0]

  // A root selector, alone or leading a compound (`html.dark`, `body > .foo`): swap the
  // root token for the scope, which is the root of the widget's world. Only a BARE one —
  // a functional `:host(.theme)` carries a condition that dropping the node would discard,
  // leaving a rule that over-matches inside the widget, so that falls through to the
  // ordinary prefixing below.
  if (
    (first.type === 'tag' || first.type === 'pseudo') &&
    ROOT_SELECTORS.has(first.type === 'tag' ? first.value : first.value.toLowerCase()) &&
    (first.type === 'tag' || first.nodes === undefined || first.nodes.length === 0)
  ) {
    const rest = sel.nodes.slice(1).join('')

    return `${prefix(scope)}${rest}`
  }

  // A bare theme class — compound onto the scope element, which is where it lives.
  if (sel.nodes.length === 1 && first.type === 'class' && THEME_CLASSES.has(first.value)) {
    return `${prefix(scope)}${selector}`
  }

  const hasCombinator = sel.nodes.some(selectorParser.isCombinator)

  // No combinator: a plain descendant prefix already says everything `:is()` would, and
  // keeps the output readable (and shorter — this is most of the stylesheet).
  if (!hasCombinator) return `${prefix(scope)} ${selector}`

  // With a combinator the selector has to be wrapped so its own ancestor parts can be
  // satisfied BY the scope element. Pseudo-elements move outside the wrapper:
  // `:is(.a > .b::before)` is invalid CSS, `:is(.a > .b)::before` is what was meant.
  // The walk takes the pseudo-CLASSES that qualify a pseudo-element with it
  // (`::-webkit-scrollbar-thumb:hover`), since those bind to the pseudo-element, not to
  // the compound — stopping at the first pseudo-class would leave the `::` inside.
  const trailing = []

  while (sel.nodes.length > 1) {
    const node = sel.nodes[sel.nodes.length - 1]

    if (node.type !== 'pseudo') break

    const isElement = selectorParser.isPseudoElement(node)

    // A pseudo-CLASS only comes along if it is qualifying a pseudo-element further left in
    // the same compound; otherwise it belongs to the compound and stays inside the wrapper.
    if (!isElement && !qualifiesPseudoElement(sel)) break

    trailing.unshift(node.toString())
    node.remove()

    if (isElement) break
  }

  const body = sel.toString().trim()

  // A pseudo-element left inside the wrapper, or a body ending in a combinator, produces
  // a rule that parses but matches NOTHING — the forgiving `:is()` list swallows the
  // error, so it neither throws nor trips the prefix check in `assertScoped`. That is a
  // silently dead rule, the same failure class this pass exists to end, pointed inward.
  // Checked on the AST, not the text: a string test for `::`/`before` would fire on
  // Tailwind's own escaped variant classes (`.before\:content-\[\'\'\]`).
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

    // Anything that isn't a pseudo — a combinator, a class, a tag — ends the run.
    if (node.type !== 'pseudo') return false
    if (selectorParser.isPseudoElement(node)) return true
  }

  return false
}

/**
 * Does this selector only ever style elements inside the widget scope?
 *
 * The cheap answer is a scope token at the HEAD of the string — the pass's own
 * `:where(.sy-atlas)` prefix, or a hand-written `.sy-atlas` selector. That was the whole
 * test until issue #104, and it is still the path virtually every selector takes.
 *
 * It is not sufficient, because THIS PASS IS NOT THE LAST THING TO TOUCH THE SELECTOR.
 * Native CSS nesting is flattened downstream of us, by the minifier, and flattening moves
 * the scope off the head of the string without moving it out of the selector. Swiper 12
 * brought this in — it dropped its LESS/SCSS sources in favour of nested CSS — and
 * produced fifteen shapes of it, in two families:
 *
 *   .swiper:not(.swiper-watch-progress),                  →  :is(<scoped>, <scoped>)
 *   .swiper-watch-progress .swiper-slide-visible {           .swiper-lazy-preloader
 *     .swiper-lazy-preloader { … } }
 *
 *   .swiper-pagination {                                  →  .swiper-pagination-disabled
 *     .swiper-pagination-disabled > & { … } }                > :is(<scoped>)
 *
 * Both are correctly confined — the element each one STYLES still has to be inside the
 * widget — so a head-anchored test was failing the build on sound CSS. Note the second
 * family: no amount of looking at the head of the string can accept it, because the
 * scope legitimately lives in the SUBJECT.
 *
 * So the real question is asked instead: is the subject — the final compound, the element
 * the rule paints — necessarily inside the scope? Which is what the pass has always been
 * for; the head of the string was only ever a proxy for it.
 *
 * The head match survives as a FAST PATH, but it is not sufficient on its own either, and
 * that was true before #104 as well: `.sy-atlas ~ .foo` leads with the scope and styles a
 * SIBLING of the widget root, which is an arbitrary host element. A head-anchored test
 * accepts it. Nothing emits that shape today, but a hand-written rule in `globals.css`
 * would be passed through untouched AND waved through the gate, so the fast path now
 * declines any selector carrying a sibling combinator and lets the subject walk decide.
 * (`+` also appears inside `:nth-child(2n+1)`, which merely sends a rare selector down
 * the slow path and costs nothing.)
 */
const scopedPatterns = new Map()

/** `~` or `+` anywhere — deliberately over-broad; it only routes, it never decides. */
const MAYBE_SIBLING = /[~+]/

export function isSelectorScoped(selector, scope = WIDGET_SCOPE) {
  const trimmed = selector.trim()

  let pattern = scopedPatterns.get(scope)

  if (!pattern) {
    pattern = new RegExp(`^(:where\\()?\\.${scope}(?![\\w-])`)
    scopedPatterns.set(scope, pattern)
  }

  if (pattern.test(trimmed) && !MAYBE_SIBLING.test(trimmed)) return true

  // Nothing without the class anywhere in it can be confined by it. This is what spares
  // the TRANSFORM a parse — its input is third-party selectors that never mention the
  // scope. On the ASSERT side every selector mentions it, and the head regex above is
  // what short-circuits instead, leaving only the flattened shapes to parse.
  if (!trimmed.includes(`.${scope}`)) return false

  return isSubjectConfined(parser.astSync(trimmed).first, scope)
}

/**
 * Scan right-to-left from the subject and report whether anything on its ANCESTOR chain
 * pins it inside the scope. Walking backwards visits the subject's own compound first,
 * then the combinator above it, then the next compound up — so the walk stops at the
 * first step that isn't an ancestor step.
 *
 * Only the descendant and child combinators are ancestor steps. Refusing `+` and `~` is
 * NECESSARY, not fastidious: a bare `.sy-atlas` counts as a scope token (a descendant of
 * the root is inside the widget), so crediting siblings would accept
 * `:is(:where(.sy-atlas)) ~ .b` — and a sibling of the scope ROOT is an arbitrary host
 * element. That is a real leak, and it would ship green.
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
 * Does this one node confine its compound to the scope? Either it IS the scope class, or
 * it is an `:is()`/`:where()` whose every branch is scoped.
 *
 * "Every" is what keeps the widened test a fix rather than a hole: one unscoped branch
 * means the rule can match outside the widget, so `:is(:where(.sy-atlas) .a, .b) .c` is
 * still rejected — the pass's own spec pins that.
 */
function isScopeToken(node, scope) {
  if (node.type === 'class') return node.value === scope
  if (node.type !== 'pseudo' || !/^:(is|where)$/i.test(node.value)) return false

  return node.nodes?.length > 0 && node.nodes.every((b) => isSelectorScoped(b.toString(), scope))
}

/** Rules inside `@keyframes` are `from`/`to`/`50%` — not selectors, never prefixed. */
function isKeyframeStep(rule) {
  return rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)
}

// Words that can appear in an `animation` shorthand as something other than a name.
// The rename is a token substitution over that shorthand, so a keyframe actually CALLED
// one of these would rewrite the wrong token — `@keyframes ease` turns `animation: 1s ease`
// into `animation: 1s sy-atlas-ease`, losing the timing function and leaving the animation
// nameless. Nothing ships such a name today; if one ever appears, fail loudly rather than
// corrupt the value.
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
 * Rename every `@keyframes` in the sheet and rewrite the declarations that use them.
 * Two passes, because a keyframe may be defined after its first use.
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
  // Walk the whole ancestor chain, not just the immediate parent: a rule nested inside an
  // `@media` inside a rule still belongs to its outer rule's prefix.
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === 'rule') return true
  }

  return false
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
 * @returns {number} how many rules were checked — so a caller reporting a count doesn't
 *   need a second walk to get one.
 */
export function assertScoped(root, scope = WIDGET_SCOPE) {
  let checked = 0

  root.walkRules((rule) => {
    if (!isScopeable(rule)) return

    checked += 1

    const leaked = rule.selectors.filter((selector) => !isSelectorScoped(selector, scope))

    if (leaked.length > 0) {
      // Two ways to get here, and the second one is not a bug in the CSS: a selector can
      // also be a shape `isSubjectConfined` declines to reason about (a scope reached
      // across a sibling combinator is the one that exists today — `swiper/css/navigation`
      // would produce it). Saying so is worth the words: issue #104 was a day spent
      // looking for a leak that a flattened-but-confined selector did not have.
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

      // Belt and braces: prove the pass did what it claims before the bytes leave the
      // build.
      assertScoped(root, scope)

      result.messages.push({ type: 'scope-widget-css', plugin: 'scope-widget-css', scope })
    },
  }
}

scopeWidgetCss.postcss = true
