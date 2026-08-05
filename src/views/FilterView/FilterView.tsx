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
import { useRegionMatcher } from '@/hooks/use-region-matcher'
import {
  DEFAULT_FILTERS,
  type EventFilters,
  filtersKey,
  filtersToParams,
  hasActiveFilters,
  matchesFilters,
  parentOf,
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
// `initialDraft` seeds the form's draft for previews/tests (so a story can open in a filled,
// unapplied "dirty" state); the app renders `<FilterView />`, starting from the applied filters.
export function FilterView({ initialDraft }: { initialDraft?: EventFilters } = {}) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const location = useLocation()
  const applied = useEventFilters()

  // Start from the applied filters; discarded on close unless the user applies.
  const [draft, setDraft] = useState(initialDraft ?? applied)
  // Region cut for the live count, from the draft's selected region (see matchesFilters).
  const matchesRegion = useRegionMatcher(draft.region)

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

    return geojson.features.filter((f) => matchesFilters(f.properties, draft, today, matchesRegion))
      .length
  }, [geojson, draft, matchesRegion])

  const hasChanges = filtersKey(draft) !== filtersKey(applied)
  const draftActive = hasActiveFilters(draft)

  // Applying/clearing returns to the ORIGIN view (the drawer beneath the filters),
  // with the filters written into its query — so filtering from the calendar returns
  // to the calendar and from search back to search, each still framed by its own
  // q/center/bbox/region. Opened over a view that doesn't itself reflect the filters
  // (the country list or a region), apply instead jumps to /search to show the filtered
  // events — there's no filtered surface to return to. Either way it REPLACES the
  // filter-drawer entry (carrying its depth over) rather than stacking a new one, so the
  // drawer doesn't linger in history and a chronological back lands on the pre-filter view.
  const commit = (filters: typeof draft) => {
    // Nothing here resets the results list's reveal, and nothing needs to: the filters
    // are part of `revealKey`, so a new set is a new result set and the list is back at
    // its first page by construction (see `use-reveal`).
    const search = filtersToParams(filters, new URLSearchParams(location.search)).toString()
    const origin = parentOf(location.pathname)
    const target = origin === '/calendar' || origin === '/search' ? origin : '/search'

    navigate({ pathname: target, search }, { replace: true, state: location.state })
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
