import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { EventSlim } from '@/types'

import { useMemo } from 'react'

import { SeedSearchParams } from '@/components/ladle'
import { ViewHarness, mockEventVariants } from '@/views/story-harness'
import { SearchView } from '@/views/SearchView/SearchView'
import { useLocale } from '@/hooks/use-locale'
import { eventsQuery } from '@/config/api'
import { filtersFromParams, parseCenter } from '@/lib/shape'

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
// in-person variants within the 500 km cap: a filtered-looking list with no distance
// pill competing for attention.
const FILTERED = 'format=offline&days=1,3&langs=en&center=0,0'

const EXAMPLES: Record<string, Example> = {
  Results: { search: '', events: mockEventVariants },
  Empty: { search: '', events: [] },
  'Country website': { search: ICELAND, events: [] },
  Filtered: {
    search: FILTERED,
    events: mockEventVariants.filter(
      (event) => event.eventType === 'offline' && (event.distance ?? 0) < 500,
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
 * SearchView — the distance-ranked results screen: the geocoder + filter header over
 * the event list (with the "within 500 km" cap). "Empty" is the no-results state;
 * "Country website" the offer that replaces it when the searched country lists no
 * programs at all; "Filtered" the toolbar badge + active-filter pills over a list.
 *
 * Cases that need a URL seed it onto the decorator's OWN router via `SeedSearchParams`
 * (react-router v7 throws on a nested `<Router>`), which lands one render in — so each
 * case seeds both the default key the first render reads and the key its own params
 * resolve to, and neither render ever reaches the absent backend.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const { search, events } = EXAMPLES[example]
  // Stable per case — SeedSearchParams keys its effect on this, so a fresh object
  // every render would re-seed the URL in a loop.
  const params = useMemo(() => new URLSearchParams(search), [search])

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
