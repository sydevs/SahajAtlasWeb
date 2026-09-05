import type { Location, NavigationType, Navigator, To } from 'react-router'

import { createPath, parsePath } from 'react-router'

import {
  ROUTE_PARAM,
  hrefFor,
  pathHrefFor,
  routeFromParam,
  routeFromPathname,
  routeToParam,
} from './shape/routing'

/**
 * A react-router `History` that keeps the widget's route in a query parameter on the host page
 * (#154).
 *
 * This is written by hand, instead of adapted from `createBrowserHistory`, because three of its
 * behaviours are wrong for an embed. Each is called out below: where the location is read from,
 * what `createHref` returns, and what happens to the host's own `history.state`.
 *
 * `Router` plus this object is what `unstable_HistoryRouter` does in fifteen lines.
 * `src/router.tsx` copies those, instead of importing an `unstable_` export, so nothing here
 * depends on a name react-router has reserved the right to change.
 */

/**
 * What `Router` and `AtlasRouter` need between them.
 *
 * This is declared here, instead of imported. react-router exports `Navigator` (what `Router`
 * consumes), but keeps `History` internal, and `AtlasRouter` additionally needs the three fields
 * a history exposes to drive React state. Structural typing means this still satisfies
 * `Navigator`, which is asserted below, so a drift in their contract fails the build instead of
 * at runtime.
 */
export type AtlasHistory = Navigator & {
  readonly action: NavigationType
  readonly location: Location
  createURL(to: To): URL
  listen(fn: (update: { action: NavigationType; location: Location }) => void): () => void
}

/** Our slice of `history.state`, kept under one key so the host's own state is never disturbed. */
const STATE_KEY = '__sy_atlas'

type AtlasState = { usr?: unknown; key: string; idx: number }

/**
 * Mints an entry key.
 *
 * ⚠ **This is not decorative.** `Router` defaults `location.key` to the literal `"default"`, so a
 * history that does not mint one gives every entry the same key. `rememberCamera(location.key)`
 * (`config/store.ts`) then collapses an entire session's camera snapshots into a single bucket.
 * Back-navigation would restore the wrong viewport, and every test would stay green, because
 * nothing else in the app reads `key`.
 */
const mintKey = () => Math.random().toString(36).slice(2, 10)

/** Split a widget route (`/search?center=1,2`) into the Location fields react-router wants. */
function toLocation(route: string, state: AtlasState): Location {
  const { pathname = '/', search = '', hash = '' } = parsePath(route)

  return { pathname, search, hash, state: state.usr ?? null, key: state.key }
}

/**
 * Where the route lives in the host's URL: the only difference between the two URL-backed modes.
 *
 * The history's mechanics stay identical either way. Both modes mint a key per entry, namespace
 * our slice of `history.state`, never write an identical URL, and keep the tree consistent when a
 * write is refused. Only *reading* the route out of a URL, and *composing* one back into it,
 * differ. So those two functions are the seam, instead of a second history.
 */
export type RouteShape = {
  /** The route currently in the URL, or `undefined` when this URL names none. */
  read(win: Window): string | undefined
  /** The absolute URL that would carry `route`. */
  href(win: Window, route: string): string
}

/** `?atlas=/gb/london` on the host's own page — the default. */
export const queryShape: RouteShape = {
  read: (win) => routeFromParam(win.location.search),
  href: (win, route) => hrefFor(win.location.href, route),
}

/**
 * `/{prefix}/gb/london`: the host has dedicated a path subtree to the widget.
 *
 * ⚠ `read` returns `undefined` when the page is served outside `prefix`, and the caller falls back
 * to the boot route, instead of rendering nothing. `mountDecision` has already refused to enter
 * path mode at all if the first read misses. This covers a host that navigates their own SPA out
 * from under us afterwards.
 */
export const pathShape = (prefix: string): RouteShape => ({
  read: (win) => routeFromPathname(win.location.pathname, prefix, win.location.search),
  href: (win, route) => pathHrefFor(win.location.href, route, prefix),
})

export type QueryHistoryOptions = {
  /** Injected so the whole thing is drivable in a test without a global. */
  window?: Window
  /**
   * Where to start when the page's URL names no route.
   *
   * This is read on **every** location read, not just the first, and that is deliberate. Pressing
   * Back to an entry that predates any widget navigation lands on a URL with no parameter. The
   * right answer there is the route the widget booted at, not the root, which the visitor never
   * chose.
   */
  initialPath: string
  /** Where the route lives. Defaults to the query parameter. */
  shape?: RouteShape
}

export function createQueryHistory({
  window: win = window,
  initialPath,
  shape = queryShape,
}: QueryHistoryOptions): AtlasHistory {
  let index = 0
  let listener: ((update: { action: NavigationType; location: Location }) => void) | null = null

  /** Our state on the current entry, seeded if the host got here without us. */
  function currentState(): AtlasState {
    const raw = (win.history.state as Record<string, unknown> | null)?.[STATE_KEY]

    if (raw && typeof raw === 'object') return raw as AtlasState

    return { key: mintKey(), idx: index }
  }

  /**
   * **The host's own `history.state` is preserved, not replaced.**
   *
   * `createBrowserHistory` writes `{usr, key, idx}` as the *entire* state, discarding whatever the
   * host put there. On somebody else's page, that is not ours to do. On a `replace` we are
   * overwriting an entry the host created, and on a `push` we are adding one inside their stack
   * that their own router may later pop into. Namespacing under one key, and spreading the rest,
   * is the same courtesy the widget's old fragment writer extended to the fragment.
   */
  function writeState(next: AtlasState) {
    const host = (win.history.state as Record<string, unknown> | null) ?? {}

    return { ...host, [STATE_KEY]: next }
  }

  function readLocation(): Location {
    // The parameter first, then the embed's default. Never the root as a silent fallback — see
    // `initialPath`.
    return toLocation(shape.read(win) ?? initialPath, currentState())
  }

  let location = readLocation()
  let action: NavigationType = 'POP' as NavigationType

  function navigate(to: To, state: unknown, replace: boolean) {
    const route = typeof to === 'string' ? to : createPath(to)
    const url = shape.href(win, route)

    // ⚠ Never write an identical URL. React-router will happily push a duplicate entry, and the
    // visible symptom is a Back press that appears to do nothing — the filter and sort writers
    // rewrite `?q` on every keystroke, so this is reached constantly.
    const unchanged = url === win.location.href

    index = replace ? index : index + 1

    const next: AtlasState = { usr: state, key: replace ? location.key : mintKey(), idx: index }

    if (url && !(unchanged && replace)) {
      // A failed write must not desynchronise the tree from the URL: the location below is
      // updated either way, so the widget stays consistent with itself even where the host's
      // document refuses `pushState` mid-session.
      try {
        win.history[replace ? 'replaceState' : 'pushState'](writeState(next), '', url)
      } catch {
        // Nothing to report — the loader already probed writability at boot and would have chosen
        // memory mode. Reaching here means the page changed its mind, which is not actionable.
      }
    }

    action = (replace ? 'REPLACE' : 'PUSH') as NavigationType
    location = toLocation(route, next)
    listener?.({ action, location })
  }

  return {
    get action() {
      return action
    },
    get location() {
      return location
    },

    /**
     * **Absolute, on the host's origin.** This is the value react-router puts in every `<Link>`'s
     * `href`, so it is the single change that makes middle-click, "copy link address" and
     * open-in-new-tab work — the consequence #92 recorded and #142 left unaddressed. The reasoning
     * for absolute-over-relative is in `hrefFor`.
     */
    createHref(to: To) {
      return shape.href(win, typeof to === 'string' ? to : createPath(to))
    },

    createURL(to: To) {
      return new URL(this.createHref(to))
    },

    // `encodeLocation` is intentionally absent. It is optional on `Navigator`, and the obvious
    // implementation, parsing what `createHref` returns, would hand back the host's pathname as
    // the location's. That would poison every route the app derives from `location.pathname`.

    push(to: To, state?: unknown) {
      navigate(to, state, false)
    },

    replace(to: To, state?: unknown) {
      navigate(to, state, true)
    },

    go(delta: number) {
      win.history.go(delta)
    },

    listen(fn: (update: { action: NavigationType; location: Location }) => void) {
      listener = fn

      const onPop = () => {
        // One read of our state, not two. `currentState()` mints a key when the entry has none —
        // a host-created entry, or one predating the widget — so calling it twice would mint two
        // and use only the first. This is harmless today, and exactly the kind of thing that
        // stops being harmless when someone starts trusting `idx`.
        const state = currentState()

        action = 'POP' as NavigationType
        location = toLocation(shape.read(win) ?? initialPath, state)
        index = state.idx
        fn({ action, location })
      }

      win.addEventListener('popstate', onPop)

      return () => {
        win.removeEventListener('popstate', onPop)
        listener = null
      }
    },
  }
}

export { ROUTE_PARAM, routeToParam }
