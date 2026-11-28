import type { Story, StoryDefault } from '@ladle/react'
import type { LocateState } from '@/components/organisms/Mapbox/use-locate'

import { type ReactNode, useEffect, useState } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { MapControls, type MapControlsProps } from './MapControls'

import { FilterMenus } from '@/components/organisms/FilterMenus'
import { useFindMe } from '@/components/organisms/Mapbox/find-me'
import { useMapControls } from '@/config/store'
import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'
import { WhereFilter } from '@/views/Filters/WhereFilter'

export default { title: 'Organisms' } satisfies StoryDefault

/** Live filter buttons in a variant, every tap editing its own answers. */
function Menus({ variant }: { variant: MapControlsProps['variant'] }) {
  const [value, setValue] = useState<EventFilters>(DEFAULT_FILTERS)

  return (
    <FilterMenus
      value={value}
      variant={variant}
      where={{
        always: true,
        placeAnswered: false,
        menu: (facets) => (
          <WhereFilter
            searchable
            counts={facets?.counts.format}
            region={value.region}
            onClear={() => setValue({ ...value, region: null })}
            onPlace={() => {}}
            onSearchInstead={() => {}}
          />
        ),
      }}
      onChange={setValue}
      onClear={() => setValue(DEFAULT_FILTERS)}
    />
  )
}

/** A stand-in for the map behind the floating look. */
const MapBackdrop = ({ children }: { children: ReactNode }) => (
  <div className="flex h-56 justify-end rounded-lg bg-gray-4 p-4">{children}</div>
)

/**
 * MapControls — the map's controls: the filter buttons where they show, "Find my location" where
 * they do not (their Where menu's Near me asks the same question), and the settings menu.
 *
 * **Floating** sits in the full map's top-right corner, over the credits (`MapCorner`); its
 * filter buttons show only while the panel sits beside the map. **Inline** is the toolbar above
 * the inline embed's map.
 *
 * Find-me follows the map's request as `find-me.ts` publishes it; the Find me control here plays
 * each state. With no map, it does not render.
 */
export const Default: Story<{ findMe: LocateState }> = ({ findMe }) => {
  useEffect(() => {
    useFindMe.setState({ locate: () => {}, state: findMe })
    useMapControls.setState({ filterMenus: true })

    return () => {
      useFindMe.setState({ locate: null, state: 'idle' })
      useMapControls.setState({ filterMenus: false })
    }
  }, [findMe])

  return (
    <StoryWrapper>
      <StorySection
        description="In the full map's corner: find-me and settings in a column, each naming itself on hover."
        title="Floating"
      >
        <MapBackdrop>
          <MapControls />
        </MapBackdrop>
      </StorySection>

      <StorySection
        description="Beside the side panel the filter buttons join them, and find-me steps aside."
        title="Floating, with the filter buttons"
      >
        <MapBackdrop>
          <MapControls filterMenus={<Menus variant="floating" />} />
        </MapBackdrop>
      </StorySection>

      <StorySection
        description="The toolbar above the inline embed's map: the filter buttons, then settings."
        title="Inline"
      >
        <MapControls filterMenus={<Menus variant="inline" />} variant="inline" />
      </StorySection>

      <StorySection
        description="Over the filters' own view, which asks the same questions, find-me stands in for the buttons."
        title="Inline, without the filter buttons"
      >
        <MapControls variant="inline" />
      </StorySection>

      <div />
    </StoryWrapper>
  )
}

Default.storyName = 'Map Controls'
Default.args = { findMe: 'idle' }
Default.argTypes = {
  findMe: {
    name: 'Find me',
    options: ['idle', 'waiting', 'found', 'failed'],
    control: { type: 'radio' },
    defaultValue: 'idle',
  },
}
