import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import { Button } from '@/components/atoms/Button'
import { SearchFilters } from '@/components/molecules'
import { useSearchState } from '@/config/store'
import { hasActiveFilters } from '@/lib/shape'
import { CloseButton } from '@/views/shared'

// The event-filters drawer (route `/filters`, or `/search/filters` when stacked
// over a search). A normal drawer view — standard header + close chrome and the
// usual stacking — so it reads as clearly distinct from the panel beneath it and
// dismisses like every other drawer. It does NOT reframe the map: filters are
// location-agnostic, so the camera stays where the parent view left it while the
// pins re-filter live behind the sheet. Filter values live in useSearchState; the
// URL only records that the drawer is open (matching every other view).
export function FilterView() {
  const { t } = useTranslation('common')
  const active = useSearchState((state) => hasActiveFilters(state))
  const clearFilters = useSearchState((state) => state.clearFilters)

  return (
    <>
      <DrawerHeader className="justify-between">
        <div className="min-w-0 truncate text-lg font-bold">{t('filters.title')}</div>
        <CloseButton />
      </DrawerHeader>
      <DrawerBody className="p-4">
        <SearchFilters />
      </DrawerBody>
      {active && (
        <DrawerFooter className="p-3">
          <Button className="w-full" variant="flat" onClick={clearFilters}>
            {t('filters.clear')}
          </Button>
        </DrawerFooter>
      )}
    </>
  )
}
