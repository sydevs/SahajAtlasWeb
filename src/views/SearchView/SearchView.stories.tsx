import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { EventSlim } from '@/types'

import { useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import { ViewHarness, mockEventSeries, mockEventVariants } from '@/views/story-harness'
import { SearchView } from '@/views/SearchView/SearchView'
import { useLocale } from '@/hooks/use-locale'
import { eventsQuery } from '@/config/api'
import { FOREIGN_NEARBY_KM, NEARBY_KM, filtersFromParams, parseCenter } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// With no `?center` in the URL, SearchView ranks from the view-state default (0, 0).
const DEFAULT_CENTER: [number, number] = [0, 0]

/** A previewable state: the URL query it needs, and the list that query resolves to. */
type Example = {
  /** The case's `?…` query (`''` for the bare, unparameterized search). */
  search: string
  events: EventSlim[]
}

// Reykjavík, marked as a search in Iceland. Iceland is absent from the seeded region
// tree (`mockRegionNodes`), so `countryHasPrograms` says it lists none and the empty
// state becomes the country-website offer rather than "No events found."
const ICELAND = 'q=Iceland&center=-21.9,64.1&cc=IS'

// Three applied filters, so the toolbar carries a "(3)" badge and the pills row
// renders. Like the CalendarView story, the events are pre-seeded regardless of the
// filters — these are for the pill UI, not to cut the list — so the seeded set is the
// in-person variants inside the distance boundary: a filtered-looking list with no
// pill competing for attention.
const FILTERED = 'format=offline&days=1,3&langs=en&center=0,0'

// A searched place, so the list segments at the distance boundary — the reveal cases
// below are about that boundary, and without a `?center` there is nothing to be distant
// from (the whole set is one segment). `?cc` is the searched COUNTRY, which the boundary
// also reads: an event across a border is held to half the distance.
//
// Each carries a DISTINCT centre, not just a distinct `?q`. The reveal is session state
// keyed by `revealKey`, which is built from the events query key — so two cases sharing
// a centre share a key, and paging deep in one would open the next already paged. The
// store is module-global and outlives the harness's per-case query client, so nothing
// else separates them.
const SEARCHED = 'q=Cambridge&center=0.12,52.21&cc=GB'
const SEARCHED_SPARSE = 'q=Dover&center=1.31,51.13&cc=GB'
const SEARCHED_BORDER = 'q=Folkestone&center=1.18,51.08&cc=GB'

const EXAMPLES: Record<string, Example> = {
  Results: { search: '', events: mockEventVariants },
  // More matches than one page. The foot of the list carries "Show more" — and because
  // this is the nearby segment, the list also presses it for you as you reach it, so
  // scrolling pages on without a click. Nothing refetches; every match is already here.
  Paged: { search: SEARCHED, events: mockEventSeries(60) },
  // A handful nearby and a long tail past NEARBY_KM. Auto-paging stops dead at the
  // boundary and the control becomes "Show distant events" — the list's only distance
  // affordance now that the "< N km" pill is gone, and the one reveal that always takes
  // a deliberate press. Press it and paging goes back to being explicit from there on.
  'Distant events': {
    search: SEARCHED_SPARSE,
    events: [
      ...mockEventSeries(6, { step: 12 }),
      ...mockEventSeries(40, { from: NEARBY_KM + 120, step: 40, offset: 100 }),
    ],
  },
  // Same distances, different countries. The French events sit between
  // FOREIGN_NEARBY_KM and NEARBY_KM — near enough to be nearby at home, too far to lead
  // the list from across a border — so only the British ones are in the nearby segment
  // and the rest wait behind "Show distant events".
  'Across a border': {
    search: SEARCHED_BORDER,
    events: [
      ...mockEventSeries(4, { from: FOREIGN_NEARBY_KM + 20, step: 15 }),
      ...mockEventSeries(30, {
        from: FOREIGN_NEARBY_KM + 25,
        step: 4,
        offset: 200,
        country: 'FR',
      }),
    ],
  },
  Empty: { search: '', events: [] },
  'Country website': { search: ICELAND, events: [] },
  Filtered: {
    search: FILTERED,
    events: mockEventVariants.filter(
      (event) => event.eventType === 'offline' && (event.distance ?? 0) < NEARBY_KM,
    ),
  },
}

type ExampleKey = keyof typeof EXAMPLES

// The events key SearchView reads for a given query — through the same `eventsQuery`
// factory the list itself uses, fed the `?center` and filters decoded from that query
// by the same codecs the view uses. Seed and read therefore cannot drift.
const eventsKey = (search: string, locale: string) => {
  const params = new URLSearchParams(search)
  const [longitude, latitude] = parseCenter(params.get('center')) ?? DEFAULT_CENTER

  return eventsQuery(latitude, longitude, filtersFromParams(params), locale).queryKey
}

/**
 * SearchView — the distance-ranked results screen: the geocoder header over the event
 * list, with the Filters + Sort toolbar in its own fixed band between the two (a
 * `DrawerToolbar`, outside the scroll container — the list pages as you scroll, so a
 * toolbar inside the body would scroll away exactly when a long list made it useful).
 *
 * "Paged" covers the reveal control and the auto-paging that fires as you reach it;
 * "Distant events" the boundary where that stops and a deliberate press takes over;
 * "Across a border" the same boundary tightened to half the distance for another
 * country. "Empty" is the no-results state; "Country website" the offer that replaces
 * it when the searched country lists no programs at all; "Filtered" the toolbar badge +
 * active-filter pills over a list.
 *
 * Cases that need a URL seed it onto the decorator's OWN router via `SeedSearchParams`
 * (react-router v7 throws on a nested `<Router>`), which lands one render in — so each
 * case seeds both the default key the first render reads and the key its own params
 * resolve to, and neither render ever reaches the absent backend.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const { events } = EXAMPLES[example]
  // Stable per case — SeedSearchParams keys its effect on this, so a fresh object every
  // render would re-seed the URL in a loop. Memoized on the CASE, not on its query
  // string: two cases sharing a query would otherwise share one object and one seed, so
  // switching between them wouldn't re-seed and whatever the first left in the URL (a
  // cleared filter, a changed sort) would carry into the second.
  const params = useMemo(() => new URLSearchParams(EXAMPLES[example].search), [example])

  return (
    <ViewHarness
      seed={(client: QueryClient) => {
        // Seed this case's list under EVERY case's key. `SeedSearchParams` lands one
        // render in, so switching the Example control re-creates the client while the
        // *previous* case's URL is still live — seeding only this case's key would
        // miss on that first render and fire a real request at the absent backend.
        for (const query of new Set(['', ...Object.values(EXAMPLES).map((e) => e.search)])) {
          client.setQueryData<EventSlim[]>(eventsKey(query, locale), events)
        }
      }}
      seedKey={example}
    >
      <SeedSearchParams params={params}>
        <SearchView />
      </SeedSearchParams>
    </ViewHarness>
  )
}

Default.storyName = 'Search'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Results' }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Results',
  },
}
