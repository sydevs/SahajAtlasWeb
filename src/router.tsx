import type { ReactNode } from 'react'
import type { AtlasHistory } from './lib/atlas-history'
import type { RouterMode } from './lib/shape/routing'

import { Router } from 'react-router'
import { useLayoutEffect, useMemo, useState } from 'react'

import { RoutingContext } from './config/routing'
import { createQueryHistory, pathShape, queryShape } from './lib/atlas-history'
import { hrefFor, pathHrefFor } from './lib/shape/routing'

/**
 * The widget's router (#154).
 *
 * Wraps react-router's low-level `Router` with our own history, and owns the one decision about
 * where the route lives so that no view below ever asks. It is fifteen lines of state plumbing
 * copied from `unstable_HistoryRouter` rather than an import of it: `Router`, `RouterProps` and
 * `Navigator` are stable public API, and an `unstable_` export is a name react-router has reserved
 * the right to change under a widget that deploys evergreen.
 *
 * Three modes:
 *
 * - **query** — the route is `?atlas=…` on the host's own URL. The default, and the whole point:
 *   it is a real, indexable, shareable URL on the client's domain.
 * - **path** — the route is the pathname under a prefix the host serves as a subtree, e.g.
 *   `/map/gb/london`. Opt-in, and the prefix comes from the client record rather than from a
 *   parameter, so `Widget.tsx` resolves it before this mounts.
 * - **memory** — a degradation, taken when the URL cannot be written at all. The widget works; its
 *   route is simply not anywhere a visitor could copy, which is what `hrefFor` being `undefined`
 *   tells the tree.
 */
export type AtlasRouterProps = {
  mode: RouterMode
  /** Where to boot. Under query routing this is only the fallback when the URL names no route. */
  path: string
  /** The path prefix, required when `mode === 'path'` and meaningless otherwise. */
  prefix?: string
  children: ReactNode
}

/** The memory branch: react-router's own `MemoryRouter` would do, but this keeps one code path. */
function useHistoryState(history: AtlasHistory) {
  const [state, setState] = useState({ action: history.action, location: history.location })

  // Layout effect, not effect: subscribing after paint would drop a navigation that happened
  // between render and commit, which is reachable on a boot-time redirect.
  useLayoutEffect(() => history.listen(setState), [history])

  return state
}

export default function AtlasRouter({ mode, path, prefix = '', children }: AtlasRouterProps) {
  // Built once. A history recreated on re-render would reset the visitor to `path` every time the
  // locale changed — the failure the old `mount` ref existed to prevent, in a new place.
  // `path` is deliberately not a dependency: it is the boot route, and re-reading it would reset
  // the visitor on every re-render. `useState`'s initialiser is the honest expression of once.
  const [history] = useState(() =>
    createQueryHistory({
      initialPath: path,
      shape: mode === 'path' ? pathShape(prefix) : queryShape,
    }),
  )

  const { action, location } = useHistoryState(history)

  // Memory mode has no URL to offer, and says so with `undefined` rather than a plausible-looking
  // string. `hrefFor` is read live off `window.location` so a host that rewrites their own query
  // (WordPress permalinks, an analytics param) is reflected in the next link we hand out.
  const resolve = useMemo(() => {
    if (mode === 'memory') return undefined
    if (mode === 'path') return (route: string) => pathHrefFor(window.location.href, route, prefix)

    return (route: string) => hrefFor(window.location.href, route)
  }, [mode, prefix])

  return (
    <RoutingContext.Provider value={resolve}>
      <Router location={location} navigationType={action} navigator={history}>
        {children}
      </Router>
    </RoutingContext.Provider>
  )
}
