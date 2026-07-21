import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { Button } from '@/components/atoms/Button'
import { SearchFilters } from '@/components/molecules'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useEventFilters } from '@/hooks/use-filters'
import {
  DEFAULT_FILTERS,
  filtersKey,
  filtersToParams,
  hasActiveFilters,
  matchesFilters,
  todayISO,
} from '@/lib/shape'
import { CloseButton, DrawerTitle } from '@/views/shared'

// The event-filters drawer (route `/filters`, or `/search/filters` when stacked
// over a search). A normal drawer view — standard header + close chrome and the
// usual stacking. Filters are NOT applied live: the form edits a local draft.
// "Apply (N)" (shown only when the draft differs from what's applied) commits the
// draft into the /search query — the single source of truth that drives the list +
// map — and closes the drawer, showing how many events the draft matches. "Clear
// all" resets everything AND applies + closes. The per-filter clears inside the
// form stay draft-only.
export function FilterView() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const location = useLocation()
  const applied = useEventFilters()

  // Start from the applied filters; discarded on close unless the user applies.
  const [draft, setDraft] = useState(applied)

  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // A live preview of how many events the draft filters match. Skip the full-feed
  // predicate scan when the draft is all-default (every event matches).
  const count = useMemo(() => {
    if (!geojson) return undefined
    if (!hasActiveFilters(draft)) return geojson.features.length

    const today = todayISO()

    return geojson.features.filter((f) => matchesFilters(f.properties, draft, today)).length
  }, [geojson, draft])

  const hasChanges = filtersKey(draft) !== filtersKey(applied)
  const draftActive = hasActiveFilters(draft)

  // Applying/clearing always shows the results: go to /search with the filters
  // written into the query (preserving any existing q/bbox/center), even when the
  // drawer was opened over the country list — the point of applying is to see the
  // filtered events, not return to the countries.
  const commit = (filters: typeof draft) => {
    const search = filtersToParams(filters, new URLSearchParams(location.search)).toString()

    navigate({ pathname: '/search', search })
  }

  return (
    <>
      <DrawerHeader className="justify-between">
        <DrawerTitle title={t('filters.title')} />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <SearchFilters value={draft} onChange={setDraft} />
      </DrawerBody>
      {(draftActive || hasChanges) && (
        <DrawerFooter className="flex items-center gap-2 p-3">
          {draftActive && (
            <Button className="flex-1" variant="flat" onClick={() => commit(DEFAULT_FILTERS)}>
              {t('filters.clear')}
            </Button>
          )}
          {hasChanges && (
            <Button className="flex-1" color="primary" onClick={() => commit(draft)}>
              {count === undefined ? t('filters.apply') : `${t('filters.apply')} (${count})`}
            </Button>
          )}
        </DrawerFooter>
      )}
    </>
  )
}
