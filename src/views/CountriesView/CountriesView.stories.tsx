import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { RegionListItem } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { ListFirstMap } from '@/views/ListFirstMap'
import { useMapAsked, useShowMap } from '@/config/mode'
import { mockCountries } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

const EXAMPLES = {
  'All countries': mockCountries,
  'Single country': mockCountries.slice(0, 1),
} as const

type ExampleKey = keyof typeof EXAMPLES

/**
 * CountriesView — the root screen. It shows the geocoder search and filter, an "Online
 * Classes" entry with its count read from the feed, then the global country list, busiest
 * first (the view sorts by event count).
 *
 * The State control carries no not-found flavour. There is no slug to get wrong at the root, so
 * no dead link reaches it. What a viewer meets here is the first fetch of the session failing.
 * Unlike the app-level fallback, the drawer stack IS mounted here, so it renders in the root's
 * own chrome — geocoder, filters, collapse — with the panel top-left, where the country list
 * would have been.
 */
export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({
  example,
  state,
}) => (
  <ViewStory
    example={example}
    seed={(client: QueryClient) =>
      client.setQueryData<RegionListItem[]>(['countries'], EXAMPLES[example] ?? [])
    }
    state={state}
  >
    <CountriesView />
  </ViewStory>
)

Default.storyName = 'Countries'
Default.meta = { width: 'xsmall' }
Default.args = { example: 'All countries', state: NO_ERROR }
Default.argTypes = {
  example: {
    name: 'Example',
    options: Object.keys(EXAMPLES),
    control: { type: 'radio' },
    defaultValue: 'All countries',
  },
  state: stateControl(),
}

/**
 * `view=list` — the interface opens on its list, with no map behind it, and a Map button in the
 * header (`MapButton`). Pressing it opens the map for good (`ListFirstMap`): there is no way back
 * to the list (Devindra, 12 Nov), and the phone sheet starts at its open stop, below the map the
 * visitor asked for. The real map needs its own token and frame, so a plain panel stands in for it
 * here; press Map to see the swap.
 */
export const ListFirst: Story = () => (
  <ViewStory
    example="list-first"
    seed={(client: QueryClient) =>
      client.setQueryData<RegionListItem[]>(['countries'], mockCountries)
    }
  >
    <ListFirstMap list={<CountriesView />}>
      <MapStandIn />
    </ListFirstMap>
  </ViewStory>
)

ListFirst.storyName = 'Countries list first'
ListFirst.meta = { width: 'xsmall' }

/** Where the map mounts once asked for, saying what the drawer stack under it is told. */
function MapStandIn() {
  const asked = useMapAsked()
  const mapButton = Boolean(useShowMap())

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-3 p-6 text-center text-sm text-gray-11">
      <p className="font-medium text-foreground">The map, mounted only now</p>
      <p>Asked for: {String(asked)} · the sheet opens at its open stop below it</p>
      <p>Map button under it: {String(mapButton)}</p>
    </div>
  )
}
