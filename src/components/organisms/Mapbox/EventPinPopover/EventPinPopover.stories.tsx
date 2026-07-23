import type { Story, StoryDefault } from '@ladle/react'
import type { DisplayableEvent } from '@/hooks/use-event-display'

import ReactMapGL, { MapProvider } from 'react-map-gl'

import { StoryWrapper, StorySection } from '../../../ladle'

import { EventPinPopover } from './EventPinPopover'

import { mockEventCourse, mockEventSlim, mockEventSlimOnline } from '@/mocks/events'

export default { title: 'Organisms' } satisfies StoryDefault

// The popover renders a react-map-gl <Popup>, which needs a live map (and so a
// VITE_MAPBOX_ACCESSTOKEN); without one we show a notice, mirroring Map.stories.
const hasToken = Boolean(import.meta.env.VITE_MAPBOX_ACCESSTOKEN)

// Three pins spread far enough apart that their popovers don't overlap: a weekly
// class, a bounded course, and a daily online class (shown in its event-local
// start time). Each exercises a different branch of the shared calendar line.
const pins: { label: string; event: DisplayableEvent; longitude: number; latitude: number }[] = [
  { label: 'weekly', event: mockEventSlim, longitude: 0.06, latitude: 52.21 },
  { label: 'course', event: mockEventCourse, longitude: 0.18, latitude: 52.21 },
  { label: 'online', event: mockEventSlimOnline, longitude: 0.12, latitude: 52.17 },
]

/**
 * EventPinPopover — the non-interactive hover popover shown over an individual
 * event pin: the shared recurrence · start-time line (#72), the same string the
 * list card leads with. It renders a react-map-gl <Popup>, so this story mounts
 * the real popovers on a live map when a token is present; the card itself still
 * follows the Ladle light/dark theme toggle.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Hover-only affordance over a single event pin. Shown here pinned open on a live map."
      title="Pin hover popover"
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
              {pins.map((pin) => (
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
