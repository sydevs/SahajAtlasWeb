import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { Button } from '@/components/atoms/Button'
import { SearchFilters } from '@/components/molecules'
import api from '@/config/api'
import { GEOJSON_STALE_TIME } from '@/config/query-client'
import { useEventFilters, useSearchState } from '@/config/store'
import { DEFAULT_FILTERS, hasActiveFilters, matchesFilters } from '@/lib/shape'
import { CloseButton, useDrawerControl } from '@/views/shared'

// The event-filters drawer (route `/filters`, or `/search/filters` when stacked
// over a search). A normal drawer view — standard header + close chrome and the
// usual stacking. Filters are NOT applied live: the form edits a local draft, and
// the footer's Apply button commits it to the store (which drives the list + map)
// and closes the drawer, showing how many events the draft matches. "Clear all"
// resets the draft; both it and the per-filter clears stay draft-only until Apply.
export function FilterView() {
  const { t } = useTranslation('common')
  const applied = useEventFilters()
  const setFilters = useSearchState((state) => state.setFilters)
  const { dismiss } = useDrawerControl()

  // Start from the applied filters; discarded on close unless the user applies.
  const [draft, setDraft] = useState(applied)

  const { data: geojson } = useQuery({
    queryKey: ['geojson'],
    queryFn: () => api.getGeojson(),
    staleTime: GEOJSON_STALE_TIME,
  })

  // A live preview of how many events the draft filters match.
  const count = useMemo(
    () => geojson?.features.filter((feature) => matchesFilters(feature.properties, draft)).length,
    [geojson, draft],
  )

  const apply = () => {
    setFilters(draft)
    dismiss()
  }

  return (
    <>
      <DrawerHeader className="justify-between">
        <div className="min-w-0 truncate text-lg font-bold">{t('filters.title')}</div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <SearchFilters value={draft} onChange={setDraft} />
      </DrawerBody>
      <DrawerFooter className="flex items-center gap-2 p-3">
        {hasActiveFilters(draft) && (
          <Button className="flex-1" variant="flat" onClick={() => setDraft(DEFAULT_FILTERS)}>
            {t('filters.clear')}
          </Button>
        )}
        <Button className="flex-1" color="primary" onClick={apply}>
          {count === undefined ? t('filters.apply') : t('filters.apply_count', { count })}
        </Button>
      </DrawerFooter>
    </>
  )
}
