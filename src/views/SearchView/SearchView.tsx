import { useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import {
  ActiveFilterPills,
  ListToolbar,
  ResetErrorBoundary,
  SortMenu,
} from '@/components/molecules'
import { DynamicEventsList } from '@/components/organisms'
import { eventsQuery } from '@/config/api'
import { useViewState } from '@/config/store'
import { useEventFilters } from '@/hooks/use-filters'
import { useLocale } from '@/hooks/use-locale'
import { useSearchCountry } from '@/hooks/use-search-country'
import { useMapController } from '@/hooks/use-map-controller'
import { boundsWith, listResetKey, parseBounds, parseCenter, splitResults } from '@/lib/shape'
import { BackButton } from '@/views/nav'
import { ExpandSheetButton, FilterButton, SearchField, useFrameOnTop } from '@/views/shared'
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

  // A place with no class of its own would otherwise frame an empty map beside a list of classes
  // somewhere else. It frames the place and its nearest classes instead, so a pin is in view. This
  // reads the same filtered list the map draws its pins from, and waits for it, so the camera makes
  // one move rather than two.
  const filters = useEventFilters()
  const { locale } = useLocale()
  const searchCountry = useSearchCountry()
  const { data: events, isPending } = useQuery(eventsQuery(latitude, longitude, filters, locale))
  const frame = useMemo(() => {
    if (!center || !events) return bounds
    const { here, nearby } = splitResults(events, { bbox: bounds, searchCountry })

    return here.length === 0 && nearby.length > 0 ? boundsWith(bounds, center, nearby) : bounds
    // `center` and `bounds` are rebuilt each render from these two params.
  }, [events, searchCountry, searchParams.get('center'), searchParams.get('bbox')])
  const waiting = center !== undefined && isPending

  // Only re-frame when what to frame changes — not on `?q` edits.
  useFrameOnTop(() => {
    if (!waiting) frameSearch({ bbox: frame, center })
  }, [frameSearch, searchParams.get('center'), frame?.join(), waiting])

  // What the list boundary below resets on — see `listResetKey`: everything that changes
  // WHAT is queried, minus `?q`.
  const resetKey = useMemo(() => listResetKey(searchParams), [searchParams])

  return (
    <>
      <DrawerHeader>
        <BackButton iconOnly />
        {/* The suggestions open under the field and reach the band's end, past the phone's "Show
            the list": a dropdown narrower than the panel leaves the list's counts peeking out
            beside it. The container starts where the field does, so `100cqi` is the room from
            there to the edge (less 2px: the list sits 1px inside the field's border on each
            side). Measured on the whole band, Back's width pushed the list that far past the
            panel and cut it off. */}
        <div className="[container-type:inline-size] flex min-w-0 flex-1 items-center gap-2 [--sy-results-w:calc(100cqi_-_2px)]">
          <SearchField />
          <ExpandSheetButton />
        </div>
      </DrawerHeader>
      {/* Outside the body, so a long list scrolls UNDER the controls rather than
          carrying them away — the list pages as you scroll, so the one moment Filters
          and Sort matter most is the moment a body-mounted toolbar would be gone. */}
      <DrawerToolbar>
        <ListToolbar>
          <FilterButton />
          <SortMenu />
        </ListToolbar>
        {/* Up here so an active filter stays in sight however far the list scrolls. */}
        <ActiveFilterPills />
      </DrawerToolbar>
      <DrawerBody>
        {/* The list owns the `['events', …]` read. The geocoder above it does not. Keeping a
            failed list local means the search field stays live, so the escape from a failed
            search is to run a different one — the most useful thing on the screen. `resetKeys`
            is load-bearing. `listResetKey` explains why. */}
        <ResetErrorBoundary FallbackComponent={ErrorPanel} resetKeys={[resetKey]}>
          <DynamicEventsList
            bbox={bounds}
            hasSearchCenter={center !== undefined}
            latitude={latitude}
            longitude={longitude}
          />
        </ResetErrorBoundary>
      </DrawerBody>
    </>
  )
}
