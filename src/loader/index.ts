/**
 * `auto.js` — the one script a host installs (#149).
 *
 * ```html
 * <script src="https://atlas.example/auto.js?key=…"></script>
 * ```
 *
 * That is the entire snippet. There is no `<sahaj-atlas>` element in host markup, and no
 * attribute to misspell. The loader creates the element. Every parameter rides on this script's
 * own URL (`./config.ts` explains why).
 *
 * **What this buys.** The widget's eager payload is about 370 KiB gz. Loading it on every page
 * view of every embed — including the ones nobody scrolls to — spends that budget on the host's
 * LCP and INP. Those are ranking signals for the very pages this program tries to get indexed.
 * The loader is about 3 KiB, and fetches the rest only when the widget is about to become
 * visible. So the cost stays proportional to whether anyone looks at it.
 *
 * **Three things it must never do.** It runs first, in a page this project does not own, before
 * anything of the widget's own is on screen:
 *
 * 1. **Throw.** Every DOM read here reads somebody else's document. A host may have patched
 *    `getBoundingClientRect`, frozen `history`, or be serving a `file://` document. An uncaught
 *    throw in a top-level script is the host's problem to debug, and this code's job to prevent —
 *    the same argument `Widget.tsx` already makes around its slot-measurement probe.
 * 2. **Block.** Do no synchronous work beyond parsing a URL, and start no network request before
 *    idle.
 * 3. **Write the host's URL.** The probes below are no-ops by construction (`replaceState` to
 *    the current href, plus a parameter written and immediately removed). The widget's own
 *    routing writes the URL later, deliberately. The loader must leave the URL exactly as it
 *    found it.
 */
import type { LoaderConfig } from './config'
import type { DetectionSignals, EmbedFingerprint } from './detect'

import { parseConfig } from './config'
import { fingerprint } from './detect'
import { ELEMENT_NAME, safeLoaderPath } from './literals'

/** The console prefix. Duplicated from `reportIntegrationWarning`'s — see `./literals.ts`. */
const LOG_PREFIX = '[sahaj-atlas]'

/** How close to the viewport the element gets before the widget is fetched. */
const PREFETCH_MARGIN = '200px'

/** A probe key no host would coincidentally own, written and removed within one task. */
const PROBE_PARAM = '__sy_atlas_probe'

const warn = (message: string) => {
  try {
    console.warn(`${LOG_PREFIX} ${message}`)
  } catch {
    // A host that broke `console` must not also break the widget.
  }
}

const error = (message: string) => {
  try {
    console.error(`${LOG_PREFIX} ${message}`)
  } catch {
    // Same reason as above.
  }
}

/**
 * Does a query parameter survive this host's router?
 *
 * This code measures the answer, rather than assuming it. A host SPA that rewrites the URL on
 * boot would swallow the widget's route silently. The failure would then look like the widget
 * forgetting where it was. This function writes and removes the parameter in the same call, both
 * as `replaceState`. So the host's URL stays unchanged whichever way the answer comes out.
 *
 * ⚠ This is a *synchronous* check, and a host router that reverts asynchronously will pass it
 * anyway. That is why `boot()` runs detection on idle, rather than at mount. By then the host's
 * own router has had a turn.
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
 * This is a genuine no-op — `replaceState` to the href this code is already on. So it cannot
 * disturb the host or add a history entry. It feeds the embed report's `canonicalViable` value.
 * A page whose URL this code cannot write cannot carry a shareable route, so it cannot be a
 * region's canonical page.
 *
 * ⚠ **This value has more than one reader. Treating it as having only one is how a field gets
 * removed along with the report.** `urlWritable` also decides `mountDecision`'s router
 * (`lib/shape/routing.ts`) — a `false` value puts the WHOLE widget into memory routing. It also
 * rides in the readiness marker that SahajCloud's verifier reads (`lib/embed-announce.ts`,
 * #153). Change any of the three, and check the other two.
 *
 * ⚠ **This is not a sandbox detector**, though it reads like one. This repo believed it was,
 * until #161 measured it. In Chrome 151, a real `sandbox="allow-scripts"` frame has an opaque
 * origin (`localStorage` throws), and still permits `replaceState` and `pushState`. What a
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
    // A cross-origin parent makes `window.top` throw on access, instead of returning a
    // foreign window. So this comparison needs a guard. A throw here means the widget is
    // framed.
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
 * Two loaders on one page cannot see each other any other way. Loaded from two different URLs,
 * they are two module instances with two sets of module state, and the browser's module map only
 * deduplicates identical `src` values. The DOM is the one thing they share.
 */
const CLAIMED_ATTR = 'data-sy-atlas-loaded'

/**
 * The element to render into: the host's, if a platform made one, otherwise this loader's own —
 * or `null` if somebody else already has one.
 *
 * Three cases, all real. The documented install is a bare `<script>`, so normally there is no
 * element, and the loader inserts one where the script sits. **Wix creates the element itself.**
 * Its Custom Element takes a tag name and a script URL, so one already exists there. Making a
 * second would mean two widgets, and `Widget.tsx`'s one-per-page rule would refuse the second one
 * anyway.
 *
 * The third case is why the claim marker exists. Adopting *any* pre-existing element is right for
 * Wix, and wrong for a page carrying the snippet twice. There, the second loader would silently
 * adopt the first one's widget. Its own configuration would be discarded, and the page would look
 * like it had one working embed, instead of one embed and one mistake. Adopting an unclaimed
 * element, and refusing a claimed one, tells the two cases apart.
 *
 * ⚠ **This is a refusal, not a limitation this code could lift.** Two widgets on a page are
 * blocked by the URL, not by this check. Both would mount routers that write the same `?atlas=`
 * parameter, and fight over it every time either one navigated. Whatever makes multiple embeds
 * possible must answer that problem first — that is routing work, not loader work.
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

  // `<head>` is never where the widget goes. Two paths can put the script there: a host that
  // put the snippet there, and the classic shim. The shim bridges to this module by appending a
  // module script to `<head>`. Inserting the element there would leave it in the document, let
  // it upgrade normally, but paint nothing — the worst kind of failure. On the shim's path, an
  // element already exists (Wix creates it), so this branch fires only when something is
  // genuinely wrong.
  if (parent && parent.nodeName !== 'HEAD') {
    // This places the element immediately before the script tag, so the widget appears where
    // the host put the snippet. The host needs no wrapper, and has no selector to set wrong.
    parent.insertBefore(element, script)

    return element
  }

  // `async` and `defer` both null `document.currentScript`. The fallback lookup can miss, and
  // a snippet in `<head>` has nowhere sensible to render. This code reports the problem instead
  // of guessing at a position. A widget in the wrong place is harder to diagnose than one that
  // explains why it is absent.
  error(
    'could not find a place to render. Load auto.js from the page body, without `async` or ' +
      `\`defer\`, or put an empty <${ELEMENT_NAME}></${ELEMENT_NAME}> where the widget should appear.`,
  )

  return null
}

/** Fetches the widget when the element is near the viewport — or now, if it already is. */
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
    // A failed IntersectionObserver is not a reason to withhold the widget.
    run()
  }
}

/**
 * Boots from a script element.
 *
 * This is exported so the classic shim can hand over its own `document.currentScript`, which it
 * must capture before the dynamic import loses it.
 */
export function start(script: HTMLScriptElement | null): void {
  const config = parseConfig(script?.getAttribute('src'), window.location.search)

  if (!config.key) {
    error('no `key` parameter on the embed script URL — the widget cannot load any data.')
  }

  const element = resolveElement(script)

  if (!element) return

  // A route on the PAGE's URL means a visitor followed a link, and the route is why they
  // clicked. So waiting for them to scroll to the embed is wrong on its own terms, before
  // auto-open even enters into it. It also removes a hazard: a lazily-mounted widget can mount
  // MID-SCROLL, where auto-opening would slam a modal over the page and lock its scroll.
  // Eager-loading the deep link removes that situation, rather than detecting it. A route from
  // the SCRIPT url is the host's default view, and stays lazy.
  const mount = () => {
    // This resolves to `src/Widget.tsx`, its own build entry. It is the seam that keeps the
    // widget out of the loader's graph, and `pnpm size` asserts the two closures stay disjoint.
    void import('../Widget').then(({ boot }) => {
      // Detection runs on idle, not here. `paramPersisted` is only meaningful once the host's
      // own router has had a turn. A host SPA that rewrites the URL during boot would otherwise
      // get measured mid-flight.
      //
      // **This hands over the observation, and nothing else.** The loader used to compose a
      // report here too — the observation joined to the page's URL. That meant capturing the
      // URL at this moment, and carrying it on the boot singleton until the widget mounted and
      // sent it. The mount is now read by the send site itself (`lib/mount.ts`), so the loader
      // has no business with the host's URL at all. There is one observation now, not two
      // copies.
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

// This capture happens at module top level, because `document.currentScript` is only valid
// while the script executes. It is null inside any later callback, and null outright under
// `async` or `defer`. The fallback covers the deferred case without guessing. It looks for a
// script whose src is this bundle's own filename — the one thing this code can recognise about
// itself.
const currentScript =
  (document.currentScript as HTMLScriptElement | null) ??
  document.querySelector<HTMLScriptElement>('script[src*="auto.js"]')

start(currentScript)

// Exported for the classic shim and for tests. `safeLoaderPath` is re-exported so the pin spec
// can reach it without importing the entry's side effects.
export { safeLoaderPath }
