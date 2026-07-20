import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { EventSlim } from '@/types'

import { ViewHarness } from '@/views/story-harness'
import { SearchView } from '@/views/SearchView/SearchView'
import { useLocale } from '@/hooks/use-locale'
import { mockEventSlimList } from '@/mocks/events'
import { DEFAULT_FILTERS, filtersKey } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// With no `?center` in the URL, SearchView ranks from the view-state default
// (0, 0), so DynamicEventsList keys on `['events', '0.00', '0.00', filtersKey, locale]`.
const CENTER = ['0.00', '0.00'] as const

const CASES: Record<string, EventSlim[]> = {
  Results: mockEventSlimList,
  'No results': [],
}

type CaseKey = keyof typeof CASES

/**
 * SearchView — the distance-ranked results screen: the geocoder + filter header
 * over the event list (with the "within 500 km" cap). Filters are all default here.
 */
export const Default: Story<{ case: CaseKey }> = ({ case: key }) => {
  const { locale } = useLocale()
  const events = CASES[key]

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<EventSlim[]>(
          ['events', CENTER[0], CENTER[1], filtersKey(DEFAULT_FILTERS), locale],
          events,
        )
      }
      seedKey={key}
    >
      <SearchView />
    </ViewHarness>
  )
}

Default.storyName = 'Search View'
Default.args = { case: 'Results' }
Default.argTypes = {
  case: { options: Object.keys(CASES), control: { type: 'select' }, defaultValue: 'Results' },
}
