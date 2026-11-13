import type { DuplicateClass } from '@/components/organisms/ProposalForm'
import type { PickedPlace } from '@/lib/proposal'
import type { EventSchedule, Geojson } from '@/types'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import api from '@/config/api'
import { GEOJSON_QUERY_KEY, eventTitlesQuery } from '@/config/api/fetch'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useLocale } from '@/hooks/use-locale'
import { possibleDuplicates } from '@/lib/proposal'
import { safePath } from '@/lib/shape'

/**
 * The listed classes a new in-person listing may duplicate — at about the same place AND
 * meeting at the same time (`possibleDuplicates`) — for Check to name before a duplicate reaches
 * the admins. Reads the feed and titles the map already loaded; the titles are fetched only when
 * a class matches.
 *
 * @param place - the new class's address; `null` for an online class or a correction
 * @param schedule - the new class's schedule with its sessions (`draftPreviewSchedule`)
 */
export function usePossibleDuplicates(
  place: PickedPlace | null,
  schedule: EventSchedule | null,
): DuplicateClass[] {
  const { locale } = useLocale()
  // Disabled, so it never fetches; it names the fetcher so a shared refetch still has one.
  const { data: feed } = useQuery<Geojson>({
    queryKey: GEOJSON_QUERY_KEY,
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
    enabled: false,
  })
  const candidates = useMemo(
    () => possibleDuplicates(place, schedule, feed?.features ?? []),
    [place, schedule, feed],
  )
  // Titles load only on a match: a flow opened from the country index never loaded them.
  const { data: titles } = useQuery({ ...eventTitlesQuery(locale), enabled: candidates.length > 0 })

  return useMemo(
    () =>
      candidates.flatMap(({ properties }) => {
        const title = titles?.get(properties.id)

        return title
          ? [
              {
                id: properties.id,
                title,
                path: safePath(properties.webPath) ?? `/${properties.id}`,
                event: { ...properties, title },
              },
            ]
          : []
      }),
    [candidates, titles],
  )
}
