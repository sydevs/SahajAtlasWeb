import type { Position } from 'geojson'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { CompactCard } from './CompactCard'

import api, { eventTitlesQuery } from '@/config/api'
import { toSlim } from '@/config/api/fetch'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { compactRows } from '@/lib/compact'
import { readGeolocationDismissed } from '@/lib/geolocation'
import { useExpansion } from '@/hooks/use-expansion'
import { useIpLocation } from '@/hooks/use-ip-location'
import { useLocale } from '@/hooks/use-locale'
import { reportInternalError } from '@/lib/report'

/**
 * The compact card's data, and deliberately **no request of its own** (issue #161).
 *
 * Both reads are the wholesale caches the rest of the app already lives on — the agnostic
 * `['geojson']` feed and the per-locale titles sliver — so in the common case the card costs a
 * derivation over bytes that are already in memory. Non-suspense on purpose: this component
 * renders in a slot a few hundred pixels tall, and a full-height loading panel there is worse
 * than a card that fills in a moment later. An empty list is a legitimate state, not an error.
 *
 * The IP lookup is the one thing it asks the network for, and it is the same once-per-session,
 * keyless lookup the full interface already makes from its root view (`GeolocationSuggestion`)
 * — no new origin, no new exposure, and `docs/embedding.md` already lists it. Without it the
 * rows fall back to the soonest classes rather than pretending to know where anybody is.
 */
export function DynamicCompactCard() {
  const { locale } = useLocale()
  const { expand } = useExpansion()
  // Gated, like every other call site. A visitor who dismissed the nearby prompt has answered
  // this question, and `docs/embedding.md` promises the lookup is skipped when no feature that
  // needs it could show — an ungated call here would quietly make that sentence false.
  const ipLocation = useIpLocation(!readGeolocationDismissed())

  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })
  const { data: titles } = useQuery(eventTitlesQuery(locale))

  // Memoized so the array below has a stable identity: the lookup's own result is one cached
  // object for the session, so this changes exactly when the guess does.
  const from = useMemo<Position | undefined>(
    () => (ipLocation ? [ipLocation.longitude, ipLocation.latitude] : undefined),
    [ipLocation],
  )
  const events = useMemo(() => {
    // Both reads are non-suspense and land independently, so the feed can arrive before the
    // titles do. Rendering then would give every row `title: ''` — cards with no accessible
    // name — so the preview waits for the pair rather than flashing nameless rows.
    if (!geojson || !titles) return []

    try {
      return compactRows(geojson, from).map((feature) =>
        // `toSlim` rather than a second shaping here: the route derivation guards a
        // CMS-authored `webPath` before it reaches an href, and one definition of that is
        // the point of exporting it.
        toSlim(feature, titles.get(feature.properties.id), from),
      )
    } catch (error) {
      // `toSlim` parses through zod, and this is the ONE place it runs in a render body
      // rather than inside a query fn — so a schema drift that React Query would have routed
      // to a retryable error state throws straight past this component and replaces the whole
      // compact embed with an error panel in a 300px box. No rows is the state this card
      // already handles, and it keeps the way into the full interface on screen.
      reportInternalError(error, 'compact card rows')

      return []
    }
  }, [geojson, titles, from])

  return <CompactCard events={events} onOpen={expand} />
}
