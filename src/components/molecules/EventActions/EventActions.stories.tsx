import type { Story, StoryDefault } from '@ladle/react'
import type { Event } from '@/types'

import { useEffect } from 'react'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventActions } from './EventActions'

import { useApproxLocation } from '@/config/store'
import { useEventDisplay } from '@/hooks/use-event-display'
import { mockEvent } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// Share opens the device's sheet where there is one, as in Safari, so the preview drops it to show
// the networks' popover everywhere. Scoped to this Ladle session; the shipped widget never imports
// a story.
try {
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
  }
} catch {
  // Not overridable here — the popover still opens once the native call fails.
}

// A representative viewer country per world region: the popover's networks order themselves from
// it (`useViewerCountry`). `Default` carries none and falls back to the universal set.
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

const online: Event = { ...mockEvent, id: 201, eventType: 'online' }
const noWebsite: Event = { ...mockEvent, id: 202, website: null }
const noContact: Event = { ...mockEvent, id: 203, contactPhone: null, contactName: null }
const inactive: Event = { ...mockEvent, id: 204, inactive: true }

// The drawer panel is about 384px wide, with a 24px gutter, so its content box is about 336px:
// the default width here. 272px is a 320px phone's sheet less its gutters. The row must fit its
// set on one line at both, never wrapping.
function Panel({ event, width = 336 }: { event: Event; width?: 272 | 336 }) {
  return (
    <div
      className={`${width === 272 ? 'w-[272px]' : 'w-[336px]'} rounded-lg border border-divider py-3`}
    >
      <EventActions event={event} strings={useEventDisplay(event)} />
    </div>
  )
}

/**
 * EventActions — the secondary action row above an event's Register CTA: quiet grey
 * buttons, an icon beside each label. The display resolver chooses the set per state.
 * Contact and Website appear only when the CMS carries them. Directions appears only for
 * a physical venue. Directions opens a menu of map services and Contact a menu with the host's
 * number, WhatsApp and Copy number. Share opens the device's share sheet, or here the region's
 * networks and Copy link in a popover. Switch the Region control to watch both menus reorder.
 */
export const Default: Story<{ region: string }> = ({ region }) => {
  const code = REGIONS[region]

  useEffect(() => {
    useApproxLocation.setState({ location: code ? { countryCode: code } : null })
  }, [code])

  return (
    <StoryWrapper>
      <StorySection
        description="The full set — Directions · Website · Contact · Share — on one line; in the panel the icons go above the labels so none is cut."
        title="Physical event"
      >
        <Panel event={mockEvent} />
      </StorySection>

      <StorySection
        description="Online events drop Directions (no venue to route to)."
        title="Online"
      >
        <Panel event={online} />
      </StorySection>

      <StorySection description="An event with no website in the CMS." title="Without website">
        <Panel event={noWebsite} />
      </StorySection>

      <StorySection description="An event with no contact phone." title="Without contact">
        <Panel event={noContact} />
      </StorySection>

      <StorySection
        description="A 320px phone: a label that would be cut puts every icon above its label."
        title="Narrow, without website"
      >
        <Panel event={noWebsite} width={272} />
      </StorySection>

      <StorySection description="Inactive: no Register exists." title="Inactive">
        <Panel event={inactive} />
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Event Actions'
Default.args = { region: 'Default' }
Default.argTypes = {
  region: {
    name: 'Region',
    options: Object.keys(REGIONS),
    control: { type: 'select' },
    defaultValue: 'Default',
  },
}
