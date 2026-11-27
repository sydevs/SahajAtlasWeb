import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { StoryFallbackArg } from '@/views/story-harness'
import type { Event } from '@/types'

import { NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'
import { ShareView } from '@/views/ShareView/ShareView'
import { useApproxLocation } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { mockEvent } from '@/mocks/events'

export default { title: 'Views' } satisfies StoryDefault

// These stories show how the share targets reorder to the viewer's region. So this disables
// the Web Share API in the preview: on a browser with a share sheet, such as Safari, Share
// would open the sheet instead of the popover of networks. This change is scoped to the Ladle
// preview session. The shipped widget never imports story files, so it stays untouched. This
// is a no-op where `navigator.share` is absent.
try {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  }
} catch {
  // Not overridable here — the popover still opens once the native call fails.
}

// A representative viewer country per world region. The share targets order themselves from
// the approximate location's country (see `useViewerCountry`). So each example seeds one country code.
// `Default` carries none, and falls back to the universal set. Email always gets appended, so
// it is the last icon in every case.
const REGIONS: Record<string, string | undefined> = {
  Default: undefined,
  Russia: 'RU',
  'East Asia': 'JP',
  'South Asia': 'IN',
  'Southeast Asia': 'ID',
  'Middle East': 'AE',
  Europe: 'DE',
  Americas: 'US',
  Africa: 'NG',
  Oceania: 'AU',
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
 * ShareView — the share drawer screen. It opens on the class's summary, over Share and Copy
 * link. Press Share to open the region's networks; switch the Region control to watch them
 * reorder to that viewer's country (email is always the final option).
 *
 * The Share link control switches what there is to share. `none` is the case Copy link, the
 * native sheet, and every share target all need and cannot fake: no canonical page, and a
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
  const code = REGIONS[region]
  const { webUrl, linkable } = SHARE_CASES[share]

  return (
    <ViewStory
      example={`${region}·${share}`}
      mode={{ linkable }}
      path={`${mockEvent.path}/share`}
      seed={(client: QueryClient) => {
        client.setQueryData<Event>(['event', mockEvent.id, locale], { ...mockEvent, webUrl })
        useApproxLocation.setState({ location: code ? { countryCode: code } : null })
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
