import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Event, IpLocation } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { ShareView } from '@/views/ShareView/ShareView'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// These stories show how the share grid reorders to the viewer's region. So this disables
// the Web Share API in the preview. On a capable browser, such as desktop Chrome,
// ShareContent otherwise leads with the single native "Share…" button, and hides the
// per-region grid. This change is scoped to the Ladle preview session. The shipped widget
// never imports story files, so it stays untouched. This is a no-op under the static build,
// where `navigator.share` is absent.
try {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  }
} catch {
  // Not overridable here — the grid still appears once the native call fails.
}

// A representative viewer country per world region. The share grid orders itself from the
// IP lookup's `country_code` (see `useViewerCountry`). So each example seeds one country code.
// `Default` carries none, and falls back to the universal set. Email always gets appended, so
// it is the last icon in every case.
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

// The two answers `useShareUrl` can give (issue #115). `canonical` is the normal case: the
// event's own public page, preferred in every mode. `none` is the case that used to hand out
// the host page's address instead. That happens for an event with no canonical link, viewed
// on a host page whose anchor the widget declined to take — so it mounted a MemoryRouter, and
// the URL names somebody's article. There is no third case to preview. Where the route IS in
// the URL, the story's own address bar stands in for it, which is exactly what the widget
// would share.
const SHARE_CASES = {
  canonical: { webUrl: mockEvent.webUrl, linkable: true },
  none: { webUrl: null, linkable: false },
}

type ShareKey = keyof typeof SHARE_CASES

/**
 * ShareView — the share drawer screen. It shows the event summary card over the copyable
 * link, and the region-ordered share grid. Switch the Region control to watch the grid
 * reorder to that viewer's country (email is always the final option).
 *
 * The Share link control switches what there is to share. `none` is the case the copy field,
 * the native sheet, and every grid target all need and cannot fake: no canonical page, and a
 * host page routing the widget off the URL. The screen says so, instead of handing out the
 * host's address (issue #115).
 *
 * Its dead link is an event's, so that body matches Registration's exactly. The two sibling
 * routes share one recovery, instead of growing two copies of it (issue #89). This view
 * renders at `<event-path>/share`, so the ladder drops both the `share` segment and the dead
 * id, and offers **Cambridge**.
 *
 * Region and State are separate axes on purpose. "Region: Not found" would read as nonsense,
 * since region here means the VIEWER's country. Under a failure, the region control is simply
 * inert.
 *
 * Region leads, because it is what this story is FOR. Ladle orders the controls panel
 * alphabetically by arg KEY, not by the order they appear here. That is why the state axis is
 * keyed `state`, not `error`, across every view story — `error` sorts above both `example` and
 * `region`, which would put the failure control first everywhere. Only Ladle's own global
 * "Brand palette" control sits higher. Nothing in a story can outrank it.
 */
export const Default: Story<{ region: RegionKey; share: ShareKey; state: StoryFallbackArg }> = ({
  region,
  share,
  state,
}) => {
  const { locale } = useLocale()
  const { code, city, country } = REGIONS[region]
  const { webUrl, linkable } = SHARE_CASES[share]

  return (
    <ViewStory
      example={`${region}·${share}`}
      mode={{ linkable }}
      path={`${mockEvent.path}/share`}
      seed={(client: QueryClient) => {
        client.setQueryData<Event>(['event', mockEvent.id, locale], { ...mockEvent, webUrl })
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
Default.args = { region: 'Default', share: 'canonical', state: NO_ERROR }
Default.argTypes = {
  region: {
    name: 'Region',
    options: Object.keys(REGIONS),
    control: { type: 'select' },
    defaultValue: 'Default',
  },
  // Keyed `share` so Ladle's alphabetical control order keeps Region leading and the
  // failure axis last — `region` < `share` < `state`.
  share: {
    name: 'Share link',
    options: Object.keys(SHARE_CASES),
    control: { type: 'select' },
    defaultValue: 'canonical',
  },
  state: stateControl('Not found · event'),
}
