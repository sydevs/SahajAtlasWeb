import { useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { DrawerBody, DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import { ListToolbar, ResetErrorBoundary, SortMenu } from '@/components/molecules'
import { DynamicEventsList } from '@/components/organisms'
import { useViewState } from '@/config/store'
import { useMapController } from '@/hooks/use-map-controller'
import { listResetKey, parseCenter } from '@/lib/shape'
import {
  CloseButton,
  FilterButton,
  GeolocationSuggestion,
  SearchField,
  useFrameOnTop,
} from '@/views/shared'
import { ErrorPanel } from '@/views/fallbacks'

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

// The search view, at route `/search`. It ranks events by distance from the geocoded place
// (`?center=lng,lat`), or, absent that, from a one-time snapshot of the map centre — never
// the live viewport, so the list does not re-sort on map pan. The distance query key stays
// quantized inside DynamicEventsList, which also applies the active event filters — online
// events included, unless the format filter narrows them out. Filters change in the
// FilterView drawer, opened from the header, so this view just reflects the current filters
// when it (re)mounts.
export function SearchView() {
  const [searchParams] = useSearchParams()
  const { frameSearch } = useMapController()

  const center = parseCenter(searchParams.get('center'))
  const bounds = parseBounds(searchParams.get('bbox'))

  // Snapshot the map centre once so ranking is stable while the user pans.
  const snapshot = useRef(useViewState.getState())
  const [longitude, latitude] = center ?? [snapshot.current.longitude, snapshot.current.latitude]

  // Only re-frame when the searched place changes — not on `?q` edits.
  useFrameOnTop(
    () => frameSearch({ bbox: bounds, center }),
    [frameSearch, searchParams.get('center'), searchParams.get('bbox')],
  )

  // What the list boundary below resets on — see `listResetKey`: everything that changes
  // WHAT is queried, minus the per-keystroke `?q`.
  const resetKey = useMemo(() => listResetKey(searchParams), [searchParams])

  return (
    <>
      <DrawerHeader>
        <SearchField />
        <CloseButton />
      </DrawerHeader>
      {/* Outside the body, so a long list scrolls UNDER the controls rather than
          carrying them away — the list pages as you scroll, so the one moment Filters
          and Sort matter most is the moment a body-mounted toolbar would be gone. */}
      <DrawerToolbar>
        <ListToolbar>
          <FilterButton />
          <SortMenu />
        </ListToolbar>
      </DrawerToolbar>
      <DrawerBody>
        <GeolocationSuggestion />
        {/* The list owns the `['events', …]` read. The geocoder above it does not. Keeping a
            failed list local means the search field stays live, so the escape from a failed
            search is to run a different one — the most useful thing on the screen. `resetKeys`
            is load-bearing. `listResetKey` explains why. */}
        <ResetErrorBoundary FallbackComponent={ErrorPanel} resetKeys={[resetKey]}>
          <DynamicEventsList
            hasSearchCenter={center !== undefined}
            latitude={latitude}
            longitude={longitude}
          />
        </ResetErrorBoundary>
      </DrawerBody>
    </>
  )
}
