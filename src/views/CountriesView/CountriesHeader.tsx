import { useTranslation } from 'react-i18next'

import { DrawerHeader } from '@/components/atoms/Drawer'
import {
  DrawerTitle,
  ExpandSheetButton,
  FilterButton,
  MapButton,
  useDrawerControl,
} from '@/views/shared'

/**
 * The first screen's header: its title, then the Map button and Filters as icon controls. The
 * country list is a browse index, not a filterable results list, so its filter access lives here
 * rather than in a list toolbar, and it has no sort menu. Collapsed to the peek, the controls give
 * way to the plain way to raise the sheet again.
 *
 * CountriesView renders it, and so does its loading placeholder (`views/fallbacks`), so the two
 * can't drift apart. Every call here is total (`defaultValue`, context reads), as the loading
 * chrome needs.
 */
export function CountriesHeader() {
  const { t } = useTranslation()
  const { collapsed } = useDrawerControl()

  return (
    <DrawerHeader>
      <div className="min-w-0 flex-1">
        <DrawerTitle
          title={t('common.chrome.widget_label', { defaultValue: 'Free meditation classes' })}
        />
      </div>
      {collapsed ? (
        <ExpandSheetButton />
      ) : (
        <div className="flex items-center gap-1">
          <MapButton />
          <FilterButton iconOnly isLast />
        </div>
      )}
    </DrawerHeader>
  )
}
