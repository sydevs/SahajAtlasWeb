import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useSearchParams } from 'react-router'

import { RecoveryButton } from './RecoveryButton'
import { usePanelFilters } from './use-panel-filters'
import { WhereFilter } from './WhereFilter'

import { Button } from '@/components/atoms/Button'
import { SearchFilters } from '@/components/molecules'
import { useFilterPanelState } from '@/config/store'
import { FILTER_PANEL_EDGE_PX, FILTER_PANEL_W_PX } from '@/config/responsive'

const PANEL_BOX = { width: FILTER_PANEL_W_PX, insetInlineEnd: FILTER_PANEL_EDGE_PX } as const

/**
 * The filters as a panel over the map's right side, for wide containers, where they fit beside
 * everything else. The map's own controls move in beside it (see `--sy-map-end` in Map.tsx). The
 * list's search box is the place to type a town, so this asks only for Near me.
 */
export function FiltersPanel() {
  const { t } = useTranslation()
  const { filters, facets, write, count, canClear, clear, pickPlace, clearWhere } =
    usePanelFilters()
  const setOpen = useFilterPanelState((s) => s.setOpen)
  const setOnScreen = useFilterPanelState((s) => s.setOnScreen)
  const [searchParams] = useSearchParams()
  const placeFirst = !filters.region && !searchParams.get('center')

  // The camera keeps its framing clear of this panel while it's up. See MapController.
  useEffect(() => {
    setOnScreen(true)

    return () => setOnScreen(false)
  }, [setOnScreen])

  return (
    <aside
      aria-label={t('filters.chrome.title')}
      className="pointer-events-auto fixed top-4 z-30 flex max-h-[calc(100%-72px)] flex-col overflow-hidden rounded-2xl border border-divider bg-background text-foreground shadow-xl"
      // From the shared constants, so the camera padding and the map controls beside the panel
      // can't drift from its real size.
      style={PANEL_BOX}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 ps-4 pe-2 pt-4 pb-1">
        <h2 className="text-xl font-semibold">{t('filters.chrome.title')}</h2>
        <Button
          isIconOnly
          aria-label={t('common.chrome.close')}
          size="md"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-2">
        <SearchFilters
          facets={facets}
          placeFirst={placeFirst}
          value={filters}
          where={
            <WhereFilter
              counts={
                facets && {
                  inPerson: facets.counts.format.offline,
                  online: facets.counts.format.online,
                }
              }
              prominent={false}
              region={filters.region}
              townSearch={false}
              onClear={clearWhere}
              onPlace={pickPlace}
            />
          }
          onChange={write}
        />
      </div>
      <footer className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-t border-divider ps-4 pe-2">
        <span aria-live="polite" className="text-sm text-gray-11">
          {count === undefined
            ? null
            : count === 0
              ? t('filters.chrome.no_match')
              : t('filters.chrome.class_count', { count })}
        </span>
        {count === 0 && facets?.recovery ? (
          <RecoveryButton filters={filters} recovery={facets.recovery} onApply={write} />
        ) : (
          canClear && (
            <Button variant="ghost" onClick={clear}>
              {t('filters.chrome.clear_one')}
            </Button>
          )
        )}
      </footer>
    </aside>
  )
}
