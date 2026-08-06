import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router'

import atlasAuth from '@/config/api/auth'
import { clientQuery, regionsQuery } from '@/config/api'
import { regionRoute } from '@/config/api/fetch'
import { useIpLocation } from '@/hooks/use-ip-location'
import { nearestKnownRegion, safePath, searchPath } from '@/lib/shape'
import { reportInternalError } from '@/lib/report'

/**
 * Somewhere real to send a viewer whose link is dead: a route, plus what to call it.
 * `kind` picks the label; the caller does the translating.
 */
export type RecoveryOffer =
  | { kind: 'region'; path: string; name: string }
  | { kind: 'city'; path: string; name: string }
  | { kind: 'countries'; path: string }

/**
 * The one destination a not-found screen offers, chosen from the first rung that
 * resolves (issue #89). Composes cached reads with the pure `nearestKnownRegion` walker,
 * exactly as `useCountrySite` composes `['regions']` with `countryHasPrograms`.
 *
 * The rungs, in the order they actually help:
 *
 *  1. **The nearest ancestor in the URL the region tree still knows.** Evidence about
 *     THIS navigation — the viewer was already heading into that place, and it still
 *     lists live classes. Linked by the node's canonical `webPath`, not the URL prefix,
 *     which may be a legacy chain.
 *  2. **The host's configured home region.** Evidence about the SITE rather than this
 *     navigation, so it ranks below (1) — but a France-scoped embed's visitor almost
 *     certainly wants France, and `AppShell` already suspends on the client record, so
 *     it costs no request.
 *  3. **A cached IP guess** — "See events near Bordeaux". Read PASSIVELY
 *     (`useIpLocation(false)`): never fire the lookup from an error screen. A blocked
 *     CSP is a plausible *cause* of the failure being displayed, so the recovery could
 *     fail the same way the thing it's recovering from did — and a ≤5s request would
 *     resolve a new button under a moving cursor on the one screen the viewer is
 *     scanning for something to click.
 *  4. **The country list.** Names nowhere in particular, which is why it's last — and
 *     always exists, which is why it's the floor. Guarantees a not-found screen always
 *     has somewhere to go.
 *
 * Total: a cache miss costs a rung, never an answer, and any internal failure degrades to
 * the floor rather than throwing. This runs inside an error fallback, where a throw would
 * blank the widget on someone else's page — so the seam that exists to explain a failure
 * must never become a second one.
 */
export const useRecoveryOffer = (): RecoveryOffer => {
  const location = useLocation()
  // `enabled: false` on both: read the cache, never fetch. This renders inside an error
  // fallback, and on a `server`/`offline` failure the backend is already the thing that
  // broke — re-issuing an authenticated read from the screen explaining the outage would
  // amplify it, and on a 401 would re-send the API key that was just rejected. Both are
  // warmed at bootstrap (`api.warmCaches`, and AppShell suspends on the client record), so
  // in practice they're present; a genuine miss costs a rung, which is what the ladder's
  // floor is for.
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })
  const { data: client } = useQuery({ ...clientQuery(atlasAuth.apiKey), enabled: false })
  // Same rule, and here it matters most: a blocked CSP is a plausible CAUSE of the failure
  // on screen, so the recovery must not depend on the network that just failed.
  const ipLocation = useIpLocation(false)

  return useMemo(() => {
    const countries: RecoveryOffer = { kind: 'countries', path: '/' }

    try {
      // 1 — the nearest ancestor the tree confirms.
      if (regions) {
        const slug = nearestKnownRegion(
          location.pathname,
          new Set(regions.map((region) => region.slug)),
        )
        const node = slug ? regions.find((region) => region.slug === slug) : undefined

        if (node) {
          return { kind: 'region', path: regionRoute(node), name: node.name ?? node.slug }
        }
      }

      // 2 — the host's home region.
      const home = client?.region
      const homePath = home && typeof home === 'object' ? safePath(home.webPath) : undefined

      if (home && typeof home === 'object' && homePath && homePath !== '/') {
        return { kind: 'region', path: homePath, name: home.name ?? home.slug }
      }

      // 3 — a guess someone else already paid for.
      if (ipLocation?.city) {
        return {
          kind: 'city',
          path: searchPath([ipLocation.longitude, ipLocation.latitude]),
          name: ipLocation.city,
        }
      }

      return countries
    } catch (error) {
      // A malformed webPath, an unexpected region shape — degrade to the floor, which
      // needs no data at all, and record why so a broken rung doesn't hide for months.
      reportInternalError(error, 'useRecoveryOffer')

      return countries
    }
  }, [location.pathname, regions, client, ipLocation])
}
