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
 * This is somewhere real to send a viewer whose link is dead: a route, plus what to call it.
 * `kind` picks the label. The caller does the translating.
 */
export type RecoveryOffer =
  | { kind: 'region'; path: string; name: string }
  | { kind: 'city'; path: string; name: string }
  | { kind: 'countries'; path: string }
  // This is the one rung that leaves the widget.
  // A country listing no programs at all has its own national site, which does carry local contact details. See issue #82.
  // The ladder below never chooses this rung. `useCountrySite` decides it, and the caller passes it in.
  // It is still an onward offer, so it renders through the same action row, not as its own component.
  | { kind: 'country-site'; path: string; name: string; countryCode: string }

/**
 * This is the one destination a not-found screen offers, chosen from the first rung that resolves. See issue #89.
 * It composes cached reads with the pure `nearestKnownRegion` walker, exactly as `useCountrySite` composes `['regions']` with `countryHasPrograms`.
 *
 * These are the rungs, in the order they actually help:
 *
 *  1. **The nearest ancestor in the URL the region tree still knows.**
 *     This is evidence about THIS navigation. The viewer was already heading into that place.
 *     This links by the node's canonical `webPath`, not the URL prefix, which may be a legacy chain.
 *
 *     This checks for EXISTENCE, not for events.
 *     The wholesale tree carries no counts.
 *     Deriving them needs the per-feature ancestry index that `getRegion` builds, an O(feed) scan the data layer memoizes and deliberately keeps private.
 *     So a region whose programs have all ended is still offered, and lands on `EmptyEventList`.
 *     That is a real place with working navigation and a search field, not the dead end this ladder exists to remove.
 *     That trade is better than the scan would buy.
 *  2. **The host's configured home region.**
 *     This is evidence about the SITE, not this navigation, so it ranks below rung 1.
 *     But a France-scoped embed's visitor almost certainly wants France.
 *     `AppShell` already suspends on the client record, so this costs no request.
 *  3. **A cached IP guess**, such as "See events near Bordeaux."
 *     This reads PASSIVELY, through `useIpLocation(false)`. It never fires the lookup from an error screen.
 *     A blocked CSP is a plausible CAUSE of the failure being displayed.
 *     So the recovery could fail the same way the thing it is recovering from did.
 *     A request of up to 5 seconds would also resolve a new button under a moving cursor, on the one screen the viewer is scanning for something to click.
 *  4. **The country list.**
 *     This names nowhere in particular, which is why it is last.
 *     It always exists, which is why it is the floor.
 *     It guarantees a not-found screen always has somewhere to go.
 *
 * In total: a cache miss costs a rung, never an answer.
 * Any internal failure degrades to the floor, instead of throwing.
 * This runs inside an error fallback, where a throw would blank the widget on someone else's page.
 * So the seam that exists to explain a failure must never become a second one.
 */
export const useRecoveryOffer = (): RecoveryOffer => {
  const location = useLocation()
  // `enabled: false` on both means this reads the cache, and never fetches.
  // This renders inside an error fallback.
  // On a `server` or `offline` failure, the backend is already the thing that broke.
  // Re-issuing an authenticated read from the screen explaining the outage would amplify it, and on a 401 would re-send the API key that was just rejected.
  // Both caches warm at bootstrap, through `api.warmCaches`, and AppShell suspends on the client record.
  // So in practice both are present. A genuine miss costs a rung, which is what the ladder's floor is for.
  const { data: regions } = useQuery({ ...regionsQuery(), enabled: false })
  const { data: client } = useQuery({ ...clientQuery(atlasAuth.apiKey), enabled: false })
  // The same rule applies here, and it matters most here.
  // A blocked CSP is a plausible CAUSE of the failure on screen.
  // So the recovery must not depend on the network that just failed.
  const ipLocation = useIpLocation(false)

  return useMemo(() => {
    const countries: RecoveryOffer = { kind: 'countries', path: '/' }

    try {
      // Rung 1: the nearest ancestor the tree confirms.
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

      // Rung 2: the host's home region.
      // This narrows once, not twice.
      // `!== '/'` because the root is rung 4's job.
      // `!== location.pathname` because a France-scoped embed whose France listing has emptied would otherwise answer "nothing here" with a link back to the page you are already looking at.
      const home = typeof client?.region === 'object' ? client.region : undefined
      const homePath = home ? safePath(home.webPath) : undefined

      if (home && homePath && homePath !== '/' && homePath !== location.pathname) {
        return { kind: 'region', path: homePath, name: home.name ?? home.slug }
      }

      // Rung 3: a guess someone else already paid for.
      if (ipLocation?.city) {
        return {
          kind: 'city',
          path: searchPath([ipLocation.longitude, ipLocation.latitude]),
          name: ipLocation.city,
        }
      }

      return countries
    } catch (error) {
      // A malformed `webPath`, or an unexpected region shape, degrades to the floor, which needs no data at all.
      // This records why, so a broken rung does not hide for months.
      reportInternalError(error, 'useRecoveryOffer')

      return countries
    }
  }, [location.pathname, regions, client, ipLocation])
}
