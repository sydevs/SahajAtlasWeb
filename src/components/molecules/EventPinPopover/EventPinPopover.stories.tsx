import type { Story, StoryDefault } from '@ladle/react'
import type { DisplayableEvent } from '@/hooks/use-event-display'

import ReactMapGL, { MapProvider } from 'react-map-gl'

import { StoryWrapper, StorySection } from '../../ladle'

import { EventPinCard, EventPinPopover } from './EventPinPopover'

import { mockEventCourse, mockEventSlim, mockEventSlimOnline } from '@/mocks/events'

export default { title: 'Molecules' } satisfies StoryDefault

// A weekly class, a bounded course, and a daily online class (shown in its
// event-local start time). Each exercises a different branch of the stacked
// recurrence · time card.
const samples: { label: string; event: DisplayableEvent; longitude: number; latitude: number }[] = [
  { label: 'weekly', event: mockEventSlim, longitude: 0.06, latitude: 52.21 },
  { label: 'course', event: mockEventCourse, longitude: 0.18, latitude: 52.21 },
  { label: 'online', event: mockEventSlimOnline, longitude: 0.12, latitude: 52.17 },
]

// The live-map section needs a real map (and so a VITE_MAPBOX_ACCESSTOKEN);
// without one we show a notice.
const hasToken = Boolean(import.meta.env.VITE_MAPBOX_ACCESSTOKEN)

/**
 * EventPinPopover — the non-interactive hover popover shown over an individual
 * event pin. Its card ({@link EventPinCard}) stacks the recurrence above the
 * start time (#72) so it stays narrow. The card is map-free, so the basic example
 * previews it directly; the popover itself wraps a react-map-gl `<Popup>`, shown
 * pinned open on a live map in context.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The card the popover shows: a calendar glyph, then the recurrence stacked above the start time."
      title="Pin card"
    >
      <div className="flex flex-wrap items-start gap-4">
        {samples.map(({ label, event }) => (
          <EventPinCard key={label} event={event} />
        ))}
      </div>
    </StorySection>

    <StorySection
      description="Mounted as react-map-gl <Popup>s, pinned open over their pins on a live map."
      inContext={true}
      title="On the map"
    >
      {hasToken ? (
        <div className="h-[70vh] w-full">
          <MapProvider>
            <ReactMapGL
              initialViewState={{ longitude: 0.12, latitude: 52.2, zoom: 11 }}
              mapStyle="mapbox://styles/mapbox/light-v11"
              mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESSTOKEN}
              style={{ width: '100%', height: '100%' }}
            >
              {samples.map((pin) => (
                <EventPinPopover
                  key={pin.label}
                  event={pin.event}
                  latitude={pin.latitude}
                  longitude={pin.longitude}
                />
              ))}
            </ReactMapGL>
          </MapProvider>
        </div>
      ) : (
        <div className="max-w-md rounded border border-gray-6 p-4 text-sm text-gray-11">
          Set <code>VITE_MAPBOX_ACCESSTOKEN</code> in <code>.env.local</code> to preview the popover
          on a live map.
        </div>
      )}
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Event Pin Popover'
