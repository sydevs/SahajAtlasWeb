// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ListFirstMap } from './ListFirstMap'
import { MapButton } from './shared'

import { useMapAsked, useShowMap } from '@/config/mode'

// `view=list`'s Map button is a re-render: pressing it swaps the list for the map, for good. Only a
// mounted tree can show that, so this spec opts into jsdom (`docs/testing.md`, the jsdom
// exception). i18next echoes the key; the geocoder modules `views/shared` pulls in are stood in for
// at the vendor boundary.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@mapbox/search-js-react', () => ({ Geocoder: () => null }))
vi.mock('react-map-gl', () => ({ useMap: () => ({}) }))

/** Stands in for the interface with its map: what the drawer stack under it would read. */
function MapProbe() {
  const asked = useMapAsked()
  const showMap = useShowMap()

  return <p data-asked={String(asked)} data-map-button={String(Boolean(showMap))} id="map" />
}

let root: ReturnType<typeof createRoot> | undefined
let container: HTMLDivElement

const mount = async () => {
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () =>
    root!.render(
      <ListFirstMap list={<MapButton />}>
        <MapProbe />
      </ListFirstMap>,
    ),
  )
}

const mapButton = () =>
  [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'common.map.map',
  )

describe('ListFirstMap — view=list', () => {
  afterEach(() => act(() => root?.unmount()))

  it('opens on the list with its Map button, and mounts nothing of the map', async () => {
    await mount()

    expect(mapButton()).toBeDefined()
    expect(container.querySelector('#map')).toBeNull()
  })

  it('swaps the list for the map when the Map button is pressed', async () => {
    await mount()
    await act(async () => mapButton()!.click())

    expect(mapButton()).toBeUndefined()
    expect(container.querySelector('#map')).not.toBeNull()
  })

  // The visitor asked for the map, so the sheet starts at its open stop below it (DrawerStack),
  // and there is no way back to the list (Devindra, 12 Nov).
  it('tells the map it was asked for, and offers no Map button under it', async () => {
    await mount()
    await act(async () => mapButton()!.click())

    const map = container.querySelector('#map')!

    expect(map.getAttribute('data-asked')).toBe('true')
    expect(map.getAttribute('data-map-button')).toBe('false')
  })
})

describe('MapButton', () => {
  it('renders nothing outside view=list, where no one offers the map', () => {
    expect(renderToStaticMarkup(<MapButton />)).toBe('')
  })
})
