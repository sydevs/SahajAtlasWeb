import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { EventSlim } from '@/types'

import { ViewHarness, mockEventVariants } from '@/views/story-harness'
import { SearchView } from '@/views/SearchView/SearchView'
import { useLocale } from '@/hooks/use-locale'
import { DEFAULT_FILTERS, filtersKey } from '@/lib/shape'

export default { title: 'Views' } satisfies StoryDefault

// With no `?center` in the URL, SearchView ranks from the view-state default
// (0, 0), so DynamicEventsList keys on `['events', '0.00', '0.00', filtersKey, locale]`.
const CENTER = ['0.00', '0.00'] as const

const EXAMPLES: Record<string, EventSlim[]> = {
  Results: mockEventVariants,
  Empty: [],
}

type ExampleKey = keyof typeof EXAMPLES

/**
 * SearchView — the distance-ranked results screen: the geocoder + filter header
 * over the event list (with the "within 500 km" cap). Filters are all default here.
 * "Empty" shows the no-results state.
 */
export const Default: Story<{ example: ExampleKey }> = ({ example }) => {
  const { locale } = useLocale()
  const events = EXAMPLES[example]

  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<EventSlim[]>(
          ['events', CENTER[0], CENTER[1], filtersKey(DEFAULT_FILTERS), locale],
          events,
        )
      }
      seedKey={example}
    >
      <SearchView />
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
