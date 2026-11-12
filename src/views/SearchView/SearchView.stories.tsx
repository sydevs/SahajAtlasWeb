import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { EventSlim } from '@/types'

import { useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import {
  EMPTY,
  NO_ERROR,
  ViewStory,
  stateControl,
  mockEventSeries,
  mockEventVariants,
} from '@/views/story-harness'
import { SearchView } from '@/views/SearchView/SearchView'
import { useLocale } from '@/hooks/use-locale'
import { eventsQuery } from '@/config/api'
import {
  DEFAULT_FILTERS,
  FOREIGN_NEARBY_KM,
  NEARBY_KM,
  filtersFromParams,
  parseCenter,
} from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// With no `?center` in the URL, SearchView ranks from the view-state default (0, 0).
const DEFAULT_CENTER: [number, number] = [0, 0]

/** A previewable state: the URL query it needs, and the list that query resolves to. */
type Example = {
  /** The case's `?…` query (`''` for the bare, unparameterized search). */
  search: string
  events: EventSlim[]
  /** What the same place holds with no filters, when the filters hide some of it. */
  unfiltered?: EventSlim[]
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
// A town search with a day filter on, for the line after the town's classes.
const SEARCHED_FILTERED = 'q=Ely&center=0.26,52.4&cc=GB&days=2'
// A town with no class of its own, for the box that says so and the space after it.
const SEARCHED_EMPTY_TOWN = 'q=Hunstanton&center=0.49,52.94&cc=GB'

const EXAMPLES: Record<string, Example> = {
  Results: { search: '', events: mockEventVariants },
  // More matches than one page. The foot of the list carries "Show more". Because this is
  // the nearby segment, the list also presses that button for you as you reach it, so
  // scrolling pages on without a click. Nothing refetches. Every match is already here.
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
  // Not an "Empty" example — that lives on the State control, since any of these
  // searches can come back with nothing. This one is a different empty: a search whose
  // COUNTRY lists no programs at all, which needs `?cc=IS` and so is a property of the
  // search rather than a state of it (issue #82).
  'Country website': { search: ICELAND, events: [] },
  // Two of the town's five classes are on the chosen day. The line after them reads "3 more classes
  // in this area. Remove filters", whatever kind of filter is on.
  'Filters hide classes': {
    search: SEARCHED_FILTERED,
    events: mockEventSeries(2, { from: 2, step: 6, offset: 300 }),
    unfiltered: [
      ...mockEventSeries(2, { from: 2, step: 6, offset: 300 }),
      ...mockEventSeries(3, { from: 4, step: 3, offset: 310 }),
    ],
  },
  // "No classes near Hunstanton yet", with some room before the other cities and online classes.
  'No classes in the town': {
    search: SEARCHED_EMPTY_TOWN,
    events: [
      ...mockEventSeries(3, { from: 40, step: 15, offset: 400 }),
      ...mockEventVariants.filter((event) => event.eventType === 'online'),
    ],
  },
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

// The same place with no filters: what the filter line and the "No classes" box compare against.
const unfilteredKey = (search: string, locale: string) => {
  const [longitude, latitude] =
    parseCenter(new URLSearchParams(search).get('center')) ?? DEFAULT_CENTER

  return eventsQuery(latitude, longitude, DEFAULT_FILTERS, locale).queryKey
}

/**
 * SearchView — the distance-ranked results screen. It shows the geocoder header over the
 * event list, with the Filters and Sort toolbar in its own fixed band between the two — a
 * `DrawerToolbar`, outside the scroll container. The list pages as you scroll, so a toolbar
 * inside the body would scroll away exactly when a long list made it useful.
 *
 * "Paged" covers the reveal control and the auto-paging that fires as you reach it.
 * "Distant events" covers the boundary where that stops and a deliberate press takes over.
 * "Across a border" covers the same boundary, tightened to half the distance for another
 * country. "Empty" is the no-results state. "Country website" is the offer that replaces it
 * when the searched country lists no programs at all. "Filters hide classes" is the one line after
 * a town's classes that says how many more the filters hide, with "Remove filters". "No classes in
 * the town" is the box a town with none of its own opens on. "Filtered" shows the toolbar badge
 * and active-filter pills over a list.
 *
 * Cases that need a URL seed it onto the decorator's OWN router, via `SeedSearchParams` —
 * react-router v7 throws on a nested `<Router>`. That lands one render in, so each case
 * seeds both the default key the first render reads and the key its own params resolve to,
 * and neither render ever reaches the absent backend.
 *
 * The State control carries no not-found flavour. A search has no slug to get wrong. What it
 * reaches is a failed fetch, and `Offline` is the one to look at, since the results list is
 * the screen a viewer lands on straight from a dropped connection. It shows Try again only,
 * with no onward rung, because that search fails identically, and no report CTA, because
 * connectivity is not this project's to fix, and the report POST needs the network that just
 * went. The geocoder header and the toolbar survive it, because the boundary sits below them.
 */
export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({
  example,
  state,
}) => {
  const { locale } = useLocale()
  // `Empty` is a state of whichever search is selected, not a search of its own — so it
  // strips the results and leaves the query (and therefore the header, the pills and the
  // distance boundary) exactly as that example had them.
  const current = EXAMPLES[example] ?? EXAMPLES.Results
  const events = state === EMPTY ? [] : current.events
  // Stable per case. SeedSearchParams keys its effect on this, so a fresh object every
  // render would re-seed the URL in a loop. This memoizes on the CASE, not on its query
  // string. Two cases sharing a query would otherwise share one object and one seed, so
  // switching between them would not re-seed, and whatever the first case left in the URL —
  // a cleared filter, a changed sort — would carry into the second.
  const params = useMemo(
    () => new URLSearchParams((EXAMPLES[example] ?? EXAMPLES.Results).search),
    [example],
  )

  return (
    <ViewStory
      example={example}
      seed={(client: QueryClient) => {
        // Seed this case's list under EVERY case's key. `SeedSearchParams` lands one
        // render in, so switching the Example control re-creates the client while the
        // *previous* case's URL is still live — seeding only this case's key would
        // miss on that first render and fire a real request at the absent backend.
        for (const query of new Set(['', ...Object.values(EXAMPLES).map((e) => e.search)])) {
          client.setQueryData<EventSlim[]>(eventsKey(query, locale), events)
          client.setQueryData<EventSlim[]>(unfilteredKey(query, locale), events)
        }
        // A filtered case also reads its place with no filters, which is no case's own key.
        client.setQueryData<EventSlim[]>(
          unfilteredKey(current.search, locale),
          state === EMPTY ? [] : (current.unfiltered ?? events),
        )
      }}
      state={state}
    >
      <SeedSearchParams params={params}>
        <SearchView />
      </SeedSearchParams>
    </ViewStory>
  )
}

Default.storyName = 'Search'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'Results', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'Results',
  },
  state: stateControl(EMPTY),
}
