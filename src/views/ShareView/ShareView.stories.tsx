import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Event, IpLocation } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { ShareView } from '@/views/ShareView/ShareView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// These stories showcase how the share grid reorders to the viewer's region, so
// disable the Web Share API in the preview: on a capable browser (e.g. desktop
// Chrome) ShareContent leads with the single native "Share…" button and hides the
// per-region grid. Scoped to the Ladle preview session — the shipped widget,
// which never imports story files, is untouched. (No-op under the static build,
// where `navigator.share` is absent.)
try {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  }
} catch {
  // Not overridable here — the grid still appears once the native call fails.
}

// A representative viewer country per world region. The share grid is ordered from
// the IP lookup's `country_code` (see `useViewerCountry`), so each example seeds
// one; `Default` carries none and falls back to the universal set. Email is always
// appended, so it's the last icon in every case.
const REGIONS: Record<string, { code?: string; city: string; country: string }> = {
  Default: { city: 'Anywhere', country: 'Worldwide' },
  Russia: { code: 'RU', city: 'Moscow', country: 'Russia' },
  'East Asia': { code: 'JP', city: 'Tokyo', country: 'Japan' },
  'South Asia': { code: 'IN', city: 'Mumbai', country: 'India' },
  'Southeast Asia': { code: 'ID', city: 'Jakarta', country: 'Indonesia' },
  'Middle East': { code: 'AE', city: 'Dubai', country: 'United Arab Emirates' },
  Europe: { code: 'DE', city: 'Berlin', country: 'Germany' },
  Americas: { code: 'US', city: 'New York', country: 'United States' },
  Africa: { code: 'NG', city: 'Lagos', country: 'Nigeria' },
  Oceania: { code: 'AU', city: 'Sydney', country: 'Australia' },
}

type RegionKey = keyof typeof REGIONS

/**
 * ShareView — the share drawer screen: the event summary card over the copyable
 * link and the region-ordered share grid. Switch the Region control to watch the
 * grid reorder to that viewer's country (email is always the final option).
 *
 * Its dead link is an event's, so that body is identical to Registration's — the two
 * sibling routes share one recovery rather than growing two copies of it (issue #89).
 * Rendered at `<event-path>/share`, so the ladder drops both the `share` segment and the
 * dead id and offers **Cambridge**.
 *
 * Region and State are separate axes on purpose: "Region: Not found" would read as
 * nonsense, since region here means the VIEWER's country. Under a failure the region
 * control is simply inert.
 *
 * Region leads, because it is what this story is FOR. Ladle orders the controls panel
 * alphabetically by arg KEY, not by the order they're declared here — which is why the
 * state axis is keyed `state` rather than `error` across every view story (`error` sorted
 * above both `example` and `region`, putting the failure control first everywhere). Only
 * Ladle's own global "Brand palette" sits higher; nothing in a story can outrank it.
 */
export const Default: Story<{ region: RegionKey; state: StoryFallbackArg }> = ({
  region,
  state,
}) => {
  const { locale } = useLocale()
  const { code, city, country } = REGIONS[region]

  return (
    <ViewStory
      example={region}
      path={`${mockEvent.path}/share`}
      seed={(client: QueryClient) => {
        client.setQueryData<Event>(['event', mockEvent.id, locale], mockEvent)
        client.setQueryData<IpLocation>(['ip-location'], {
          latitude: 0,
          longitude: 0,
          city,
          country,
          ...(code ? { country_code: code } : {}),
        })
      }}
      state={state}
    >
      <ShareView eventPath={mockEvent.path} />
    </ViewStory>
  )
}

Default.storyName = 'Share'
Default.meta = { width: 'xsmall' }
Default.args = { region: 'Default', state: NO_ERROR }
Default.argTypes = {
  region: {
    name: 'Region',
    options: Object.keys(REGIONS),
    control: { type: 'select' },
    defaultValue: 'Default',
  },
  state: stateControl('Not found · event'),
}
