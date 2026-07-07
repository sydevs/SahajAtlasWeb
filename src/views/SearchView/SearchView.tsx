import { type ReactNode, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerContent, DrawerHeader } from '@/components/atoms/Drawer'
import { DynamicEventsList } from '@/components/organisms'
import { useViewState } from '@/config/store'
import { useMapController } from '@/hooks/use-map-controller'
import { CloseButton, SearchField, ViewFooter, useFrameOnTop } from '@/views/shared'

const parsePair = (value: string | null): [number, number] | undefined => {
  if (!value) return undefined
  const [a, b] = value.split(',').map(Number)

  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : undefined
}

// The search view (route `/search`): events ranked by distance from the geocoded
// place (`?center=lng,lat`) or, absent that, a one-time snapshot of the map
// centre — never the live viewport, so the list doesn't re-sort on map pan. The
// distance query key stays quantized inside DynamicEventsList. Online events are
// always included.
export function SearchView({ isTop, children }: { isTop: boolean; children?: ReactNode }) {
  const { t } = useTranslation('common')
  const [searchParams] = useSearchParams()
  const { frameSearch } = useMapController()

  const center = parsePair(searchParams.get('center'))
  const bbox = searchParams.get('bbox')
  const bounds = bbox
    ? (bbox.split(',').map(Number) as [number, number, number, number])
    : undefined

  // Snapshot the map centre once so ranking is stable while the user pans.
  const snapshot = useRef(useViewState.getState())
  const [longitude, latitude] = center ?? [snapshot.current.longitude, snapshot.current.latitude]

  useFrameOnTop(isTop, () => frameSearch({ bbox: bounds, center }), [frameSearch, searchParams])

  return (
    <DrawerContent ariaLabel={t('search')}>
      <DrawerHeader>
        <SearchField />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <DynamicEventsList latitude={latitude} longitude={longitude} />
      </DrawerBody>
      <ViewFooter />
      {children}
    </DrawerContent>
  )
}
