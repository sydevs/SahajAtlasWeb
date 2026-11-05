import { useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'

import { DrawerBody, DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import { ListToolbar, ResetErrorBoundary, SortMenu } from '@/components/molecules'
import { DynamicEventsList } from '@/components/organisms'
import { useViewState } from '@/config/store'
import { useMapController } from '@/hooks/use-map-controller'
import { listResetKey, parseBounds, parseCenter } from '@/lib/shape'
import { BackButton } from '@/views/nav'
import {
  ExpandSheetButton,
  FilterButton,
  SearchField,
  useFrameOnTop,
} from '@/views/shared'
import { ErrorPanel } from '@/views/fallbacks'

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
      {/* The field shares this band with Back, but its suggestions span the whole band: a dropdown
          narrower than the panel leaves the list's counts peeking out beside it. */}
      <DrawerHeader className="[container-type:inline-size] [--sy-results-w:100cqi]">
        <BackButton iconOnly />
        <SearchField />
        <ExpandSheetButton />
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
