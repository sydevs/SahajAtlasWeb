/**
 * `auto.js` — the one script a host installs (#149).
 *
 * ```html
 * <script src="https://atlas.example/auto.js?key=…"></script>
 * ```
 *
 * That is the entire snippet. There is no `<sahaj-atlas>` element in host markup and no
 * attribute to misspell: the loader creates the element, and every parameter rides on this
 * script's own URL (`./config.ts` argues why).
 *
 * **What it buys.** The widget's eager payload is ~370 KiB gz. Loading it on every page view of
 * every embed — including the ones nobody scrolls to — spends that on the host's LCP and INP,
 * which are ranking signals for the very pages this program is trying to get indexed. The loader
 * is ~3 KiB and fetches the rest only when the widget is about to be seen, so the cost becomes
 * proportional to whether anyone looks at it.
 *
 * **Three things it must never do**, because it runs first, in a page we do not own, before
 * anything of ours is on screen:
 *
 * 1. **Throw.** Every DOM read here is a read of somebody else's document. A host may have
 *    patched `getBoundingClientRect`, frozen `history`, or be serving a `file://` document. An
 *    uncaught throw in a top-level script is the host's problem to debug, and it is ours to
 *    prevent — the same argument `Widget.tsx` already makes around its slot-measurement probe.
 * 2. **Block.** No synchronous work beyond parsing a URL, and no network before idle.
 * 3. **Write the host's URL.** The probes below are no-ops by construction (`replaceState` to the
 *    current href; a param written and immediately removed). The widget's own routing writes the
 *    URL later, deliberately; the loader must leave it exactly as it found it.
 */
import type { LoaderConfig } from './config'
import type { DetectionSignals, EmbedFingerprint } from './detect'

import { parseConfig } from './config'
import { fingerprint } from './detect'
import { ELEMENT_NAME, safeLoaderPath } from './literals'

/** Console prefix. Duplicated from `reportIntegrationWarning`'s — see `./literals.ts`. */
const LOG_PREFIX = '[sahaj-atlas]'

/** How close to the viewport the element gets before the widget is fetched. */
const PREFETCH_MARGIN = '200px'

/** A probe key no host would coincidentally own, written and removed within one task. */
const PROBE_PARAM = '__sy_atlas_probe'

const warn = (message: string) => {
  try {
    console.warn(`${LOG_PREFIX} ${message}`)
  } catch {
    // A host that broke `console` does not get to break the widget.
  }
}

const error = (message: string) => {
  try {
    console.error(`${LOG_PREFIX} ${message}`)
  } catch {
    // As above.
  }
}

/**
 * Does a query param survive this host's router?
 *
 * Measured rather than assumed: a host SPA that rewrites the URL on boot would swallow the
 * widget's route silently, and the failure would look like the widget forgetting where it was.
 * Written and removed in the same call, both as `replaceState`, so the host's URL is unchanged
 * whichever way the answer comes out.
 *
 * ⚠ This is a *synchronous* check, and a host router that reverts asynchronously will pass it.
 * That is why `boot()` runs detection on idle rather than at mount — by then the host's own
 * router has had a turn.
 */
function probeParamPersisted(): boolean {
  try {
    const before = window.location.href
    const probe = new URL(before)

    probe.searchParams.set(PROBE_PARAM, '1')
    window.history.replaceState(window.history.state, '', probe)

    const survived = new URL(window.location.href).searchParams.get(PROBE_PARAM) === '1'

    window.history.replaceState(window.history.state, '', before)

    return survived
  } catch {
    return false
  }
}

/**
 * Can this document write its own URL?
 *
 * A genuine no-op — `replaceState` to the href we are already on — so it cannot disturb the host
 * or add a history entry. It feeds the embed report's `canonicalViable`: a page whose URL we
 * cannot write cannot carry a shareable route, so it cannot be a region's canonical page.
 *
 * ⚠ **That is not its only reader, and treating it as one is how the field gets deleted with the
 * report.** `urlWritable` also decides `mountDecision`'s router (`lib/shape/routing.ts`) — false
 * puts the WHOLE widget into memory routing — and rides in the readiness marker that SahajCloud's
 * verifier reads (`lib/embed-announce.ts`, #153). Change any of the three and check the other two.
 *
 * ⚠ **It is not a sandbox detector**, though it reads like one and this repo believed it was
 * until #161 measured it. In Chrome 151 a real `sandbox="allow-scripts"` frame has an opaque
 * origin (`localStorage` throws) and still permits `replaceState` and `pushState`. What a
 * sandbox actually blocks is `window.open`.
 */
function probeUrlWritable(): boolean {
  try {
    window.history.replaceState(window.history.state, '', window.location.href)

    return true
  } catch {
    return false
  }
}

function detect(config: LoaderConfig): EmbedFingerprint {
  const signals: DetectionSignals = {
    // A cross-origin parent makes `window.top` throw on access rather than return a foreign
    // window, so the comparison has to be guarded — and a throw here means we are framed.
    topLevel: (() => {
      try {
        return window.self === window.top
      } catch {
        return false
      }
    })(),
    urlWritable: probeUrlWritable(),
    paramPersisted: probeParamPersisted(),
  }

  return fingerprint(signals, config.routing)
}

/**
 * Marks the element a loader has taken responsibility for.
 *
 * Needed because two loaders on one page cannot see each other any other way: loaded from two
 * different URLs they are two module instances with two sets of module state, and the browser's
 * module map only dedupes identical `src`s. The DOM is the one thing they share.
 */
const CLAIMED_ATTR = 'data-sy-atlas-loaded'

/**
 * The element to render into: the host's, if a platform made one, otherwise ours — or `null` if
 * somebody else already has one.
 *
 * Three cases, all real. The documented install is a bare `<script>`, so normally there is no
 * element and the loader inserts one where the script sits. **Wix creates the element itself** —
 * its Custom Element takes a tag name and a script URL — so there one already exists, and making
 * a second would mean two widgets of which `Widget.tsx`'s one-per-page rule would refuse the
 * second anyway.
 *
 * The third case is why the claim marker exists. Adopting *any* pre-existing element is right for
 * Wix and wrong for a page carrying the snippet twice: the second loader would silently adopt the
 * first one's widget, its configuration would be discarded, and the page would look like it had
 * one working embed rather than one embed and one mistake. Adopting an unclaimed element and
 * refusing a claimed one distinguishes the two.
 *
 * ⚠ **This is a refusal, not a limitation we could lift here.** Two widgets on a page is blocked
 * by the URL, not by this: both would mount routers writing the same `?atlas=` parameter and
 * fight over it every time either navigated. Whatever makes multiple embeds possible has to
 * answer that first — which is the routing work, not the loader.
 */
function resolveElement(script: HTMLScriptElement | null): HTMLElement | null {
  const existing = document.querySelector(ELEMENT_NAME)

  if (existing instanceof HTMLElement) {
    if (existing.hasAttribute(CLAIMED_ATTR)) {
      warn(
        `the embed script is on this page more than once. Only one <${ELEMENT_NAME}> runs per ` +
          'page, so this copy will not render and its settings are ignored — remove the extra ' +
          'script tag.',
      )

      return null
    }

    existing.setAttribute(CLAIMED_ATTR, '')

    return existing
  }

  const element = document.createElement(ELEMENT_NAME)

  element.setAttribute(CLAIMED_ATTR, '')
  const parent = script?.parentNode

  // `<head>` is never where the widget goes, and it is reachable two ways: a host who put the
  // snippet there, and the classic shim, which bridges to this module by appending a module
  // script to `<head>`. Inserting there yields an element that is in the document, upgrades
  // normally, and paints nothing — the worst kind of failure. On the shim's path an element
  // already exists (Wix creates it), so this branch only fires when something is genuinely wrong.
  if (parent && parent.nodeName !== 'HEAD') {
    // Immediately before the script tag, so the widget appears where the host put the snippet.
    // No wrapper for them to add, and no selector for them to get wrong.
    parent.insertBefore(element, script)

    return element
  }

  // `async`/`defer` nulls `document.currentScript`, the fallback lookup can miss, and a snippet
  // in `<head>` has nowhere sensible to render. Rather than guess at a position, say so — a
  // widget in the wrong place is harder to diagnose than one that explains its absence.
  error(
    'could not find a place to render. Load auto.js from the page body, without `async` or ' +
      `\`defer\`, or put an empty <${ELEMENT_NAME}></${ELEMENT_NAME}> where the widget should appear.`,
  )

  return null
}

/** Fetch the widget when the element is near the viewport — or now, if it already is. */
function whenVisible(element: HTMLElement, run: () => void): void {
  if (typeof IntersectionObserver !== 'function') {
    run()

    return
  }

  try {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return

        observer.disconnect()
        run()
      },
      { rootMargin: PREFETCH_MARGIN },
    )

    observer.observe(element)
  } catch {
    // An observer we could not construct is not a reason to withhold the widget.
    run()
  }
}

/**
 * Boot from a script element — exported so the classic shim can hand over its own
 * `document.currentScript`, which it must capture before the dynamic import loses it.
 */
export function start(script: HTMLScriptElement | null): void {
  const config = parseConfig(script?.getAttribute('src'), window.location.search)

  if (!config.key) {
    error('no `key` parameter on the embed script URL — the widget cannot load any data.')
  }

  const element = resolveElement(script)

  if (!element) return

  // A route on the PAGE's URL is a visitor who followed a link, and the route is why they
  // clicked — so waiting for them to scroll to the embed is wrong on its own terms, before
  // auto-open enters into it. It also removes the hazard that gate would otherwise create: a
  // lazily-mounted widget can mount MID-SCROLL, where auto-opening would slam a modal over the
  // page and lock its scroll. Eager-loading the deep link removes the situation rather than
  // detecting it. A route from the SCRIPT url is the host's default view and stays lazy.
  const mount = () => {
    // Resolves to `src/Widget.tsx`, which is its own build entry — so this is the seam that keeps
    // the widget out of the loader's graph, and `pnpm size` asserts the two closures are disjoint.
    void import('../Widget').then(({ boot }) => {
      // Detection runs on idle rather than here: `paramPersisted` is only meaningful once the
      // host's own router has had a turn, and a host SPA that rewrites the URL during boot would
      // otherwise be measured mid-flight.
      //
      // **What is handed over is the observation and nothing else.** The loader used to compose a
      // report here too — the observation joined to the page's URL — which meant capturing the URL
      // at this moment and carrying it, on the boot singleton, until the widget mounted and sent
      // it. The mount is now read by the send site itself (`lib/mount.ts`), so the loader has no
      // business with the host's URL at all and there is one observation rather than two copies.
      const observe = () => boot(config, detect(config))

      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(observe, { timeout: 2000 })
      } else {
        setTimeout(observe, 0)
      }
    })
  }

  if (config.routeFromPage) {
    mount()
  } else {
    whenVisible(element, mount)
  }
}

// Captured at module top level, because `document.currentScript` is only valid while the script
// is executing — it is null inside any later callback, and null outright under `async`/`defer`.
// The fallback covers the deferred case without guessing: it looks for a script whose src is
// this bundle's own filename, which is the one thing we can recognise about ourselves.
const currentScript =
  (document.currentScript as HTMLScriptElement | null) ??
  document.querySelector<HTMLScriptElement>('script[src*="auto.js"]')

start(currentScript)

// Exported for the classic shim and for tests; `safeLoaderPath` is re-exported so the pin spec
// can reach it without importing the entry's side effects.
export { safeLoaderPath }
