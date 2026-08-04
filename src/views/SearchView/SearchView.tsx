import { useRef } from 'react'
import { useSearchParams } from 'react-router'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { ListToolbar, SortMenu } from '@/components/molecules'
import { DynamicEventsList } from '@/components/organisms'
import { useViewState } from '@/config/store'
import { useMapController } from '@/hooks/use-map-controller'
import { parseCenter } from '@/lib/shape'
import {
  CloseButton,
  FilterButton,
  GeolocationSuggestion,
  SearchField,
  useFrameOnTop,
} from '@/views/shared'

// A `?bbox=w,s,e,n` param, validated to four finite numbers — a malformed or
// truncated hand-typed value resolves to `undefined` so framing falls back to the
// centre/reset rather than feeding NaNs into Mapbox's fitBounds.
const parseBounds = (value: string | null): [number, number, number, number] | undefined => {
  if (!value) return undefined
  const nums = value.split(',').map(Number)

  return nums.length === 4 && nums.every(Number.isFinite)
    ? (nums as [number, number, number, number])
    : undefined
}

// The search view (route `/search`): events ranked by distance from the geocoded
// place (`?center=lng,lat`) or, absent that, a one-time snapshot of the map
// centre — never the live viewport, so the list doesn't re-sort on map pan. The
// distance query key stays quantized inside DynamicEventsList, which also applies
// the active event filters (online events included unless the format filter
// narrows them out). Filters are changed in the FilterView drawer (opened from the
// header), so this view just reflects the current filters when it (re)mounts.
export function SearchView() {
  const [searchParams] = useSearchParams()
  const { frameSearch } = useMapController()

  const center = parseCenter(searchParams.get('center'))
  const bounds = parseBounds(searchParams.get('bbox'))

  // Snapshot the map centre once so ranking is stable while the user pans.
  const snapshot = useRef(useViewState.getState())
  const [longitude, latitude] = center ?? [snapshot.current.longitude, snapshot.current.latitude]

  // Only re-frame when the searched place changes — not on `?q`/`?shown`/`?all` edits.
  useFrameOnTop(
    () => frameSearch({ bbox: bounds, center }),
    [frameSearch, searchParams.get('center'), searchParams.get('bbox')],
  )

  return (
    <>
      <DrawerHeader>
        <SearchField />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <GeolocationSuggestion />
        <ListToolbar>
          <FilterButton />
          <SortMenu />
        </ListToolbar>
        <DynamicEventsList
          hasSearchCenter={center !== undefined}
          latitude={latitude}
          longitude={longitude}
        />
      </DrawerBody>
    </>
  )
}
