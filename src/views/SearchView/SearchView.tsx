import { useRef } from 'react'
import { useSearchParams } from 'react-router'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { DynamicEventsList } from '@/components/organisms'
import { useViewState } from '@/config/store'
import { useMapController } from '@/hooks/use-map-controller'
import { CloseButton, FilterButton, SearchField, useFrameOnTop } from '@/views/shared'

const parsePair = (value: string | null): [number, number] | undefined => {
  if (!value) return undefined
  const [a, b] = value.split(',').map(Number)

  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : undefined
}

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

  const center = parsePair(searchParams.get('center'))
  const bounds = parseBounds(searchParams.get('bbox'))

  // Snapshot the map centre once so ranking is stable while the user pans.
  const snapshot = useRef(useViewState.getState())
  const [longitude, latitude] = center ?? [snapshot.current.longitude, snapshot.current.latitude]

  useFrameOnTop(() => frameSearch({ bbox: bounds, center }), [frameSearch, searchParams])

  return (
    <>
      <DrawerHeader>
        <SearchField />
        <FilterButton />
        <CloseButton />
      </DrawerHeader>
      <DrawerBody>
        <DynamicEventsList
          hasSearchCenter={center !== undefined}
          latitude={latitude}
          longitude={longitude}
        />
      </DrawerBody>
    </>
  )
}
