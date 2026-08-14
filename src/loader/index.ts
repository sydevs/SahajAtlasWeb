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
import { buildReport } from './report'
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
 * Can we write the URL at all?
 *
 * A genuine no-op — `replaceState` to the href we are already on — so it cannot disturb the host
 * or add a history entry. It throws in a sandboxed iframe (opaque origin) and on `file://`, which
 * are exactly the cases where the widget must not later try to route through the URL. The host's
 * own `history.state` is passed straight back, so nothing they put there is lost.
 */
function probeUrlWritable(): boolean {
  try {
    window.history.replaceState(window.history.state, '', window.location.href)

    return true
  } catch {
    return false
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

/** Is the document we are on actually under the configured path prefix? */
function probeMountMatches(mount: string | undefined): boolean {
  if (!mount) return false

  try {
    const path = window.location.pathname

    // A `/` boundary, so `/mapper` does not read as being under `/map`. Case-insensitive to
    // agree with react-router's own `stripBasename`, which is — so that our guard and the
    // router cannot disagree about whether a location is inside the prefix.
    const prefix = mount.toLowerCase()
    const current = path.toLowerCase()

    return current === prefix || current.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
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
    mountMatches: probeMountMatches(config.mount),
  }

  return fingerprint(signals, config.routing)
}

/**
 * The element to render into: the host's, if a platform made one, otherwise ours.
 *
 * Both cases are real and neither is a fallback for the other. The documented install is a bare
 * `<script>`, so normally there is no element and the loader inserts one where the script sits.
 * But **Wix creates the element itself** — its Custom Element takes a tag name and a script URL —
 * so on that platform one already exists and creating a second would mean two widgets, of which
 * `Widget.tsx`'s one-per-page rule would refuse the second.
 */
function resolveElement(script: HTMLScriptElement | null): HTMLElement | null {
  const existing = document.querySelector(ELEMENT_NAME)

  if (existing instanceof HTMLElement) return existing

  const element = document.createElement(ELEMENT_NAME)
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
  const config = parseConfig(script?.getAttribute('src'))

  if (!config.key) {
    error('no `key` parameter on the embed script URL — the widget cannot load any data.')
  }

  if (config.routing === 'path' && !config.mount) {
    warn(
      'routing=path needs a `mount` parameter naming the path prefix the widget is served ' +
        'under (e.g. mount=/map). Falling back to query routing.',
    )
    config.routing = 'query'
  }

  const element = resolveElement(script)

  if (!element) return

  whenVisible(element, () => {
    // Resolves to `src/Widget.tsx`, which is its own build entry — so this is the seam that keeps
    // the widget out of the loader's graph, and `pnpm size` asserts the two closures are disjoint.
    void import('../Widget').then(({ boot }) => {
      // Detection runs on idle rather than here: `paramPersisted` is only meaningful once the
      // host's own router has had a turn, and a host SPA that rewrites the URL during boot would
      // otherwise be measured mid-flight.
      const report = () => {
        const observed = detect(config)
        const payload = buildReport(observed, window.location.href)

        boot(config, observed, payload)
      }

      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(report, { timeout: 2000 })
      } else {
        setTimeout(report, 0)
      }
    })
  })
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
