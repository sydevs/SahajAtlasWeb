import type { Story, StoryDefault } from '@ladle/react'

import { MapProvider } from 'react-map-gl'

import { StoryWrapper, StorySection } from '../../ladle'

import { Mapbox } from './Map'
import { MapSearch } from './MapSearch'

import { Alert } from '@/components/atoms/Alert'

export default { title: 'Organisms' } satisfies StoryDefault

// Both surfaces are thin skins over Mapbox GL — the map itself and the geocoder
// search box are Mapbox services. They need VITE_MAPBOX_ACCESSTOKEN and (for the
// map) live GeoJSON from the Atlas API, so coverage here is intentionally light:
// render the real thing when a token is present, otherwise a "needs token" notice.
const hasToken = Boolean(import.meta.env.VITE_MAPBOX_ACCESSTOKEN)

const NeedsToken = ({ what }: { what: string }) => (
  <div className="max-w-md rounded border border-gray-6 p-4 text-sm text-gray-11">
    Set <code>VITE_MAPBOX_ACCESSTOKEN</code> in <code>.env.local</code> to preview the {what}.
  </div>
)

/**
 * Mapbox — the app's map surfaces: the full interactive map (clustered event
 * points, selection, camera) and the geocoder search box that recenters it. Both
 * are powered by Mapbox GL + `@mapbox/search-js-react`, so they need a token and
 * live data; the story stays light.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <Alert
      color="secondary"
      description="These surfaces wrap Mapbox GL and the Mapbox geocoder — the tiles, map styles, and search results all come from Mapbox, not the Atlas design system."
      title="Sourced from Mapbox"
      variant="flat"
    />

    <StorySection
      description="The Mapbox geocoder search box used to recenter the map."
      title="Search"
    >
      {hasToken ? (
        <MapProvider>
          <div className="max-w-md">
            <MapSearch onSelect={() => {}} />
          </div>
        </MapProvider>
      ) : (
        <NeedsToken what="geocoder" />
      )}
    </StorySection>

    <StorySection
      description="The full interactive map — clustered event points, selection, camera."
      title="Map"
    >
      {hasToken ? (
        <div className="h-[70vh] w-full">
          <MapProvider>
            <Mapbox />
          </MapProvider>
        </div>
      ) : (
        <NeedsToken what="live map" />
      )}
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Mapbox'
