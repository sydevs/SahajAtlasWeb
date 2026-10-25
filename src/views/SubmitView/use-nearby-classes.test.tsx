// @vitest-environment jsdom
import type { PickedPlace } from '@/lib/proposal'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { type NearbyClass, useNearbyClasses } from './use-nearby-classes'

import { GEOJSON_QUERY_KEY, eventTitlesQuery } from '@/config/api/fetch'
import { mockGeojson } from '@/mocks/regions'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))

let found: NearbyClass[] = []

function Probe({ place }: { place: PickedPlace | null }) {
  found = useNearbyClasses(place)

  return null
}

const placed = mockGeojson.features.find(
  (feature) => feature.geometry && feature.properties.eventType !== 'online',
)!
const [lng, lat] = placed.geometry!.coordinates

const render = async (place: PickedPlace | null) => {
  const client = new QueryClient()

  client.setQueryData(GEOJSON_QUERY_KEY, mockGeojson)
  client.setQueryData(
    eventTitlesQuery('en').queryKey,
    new Map([[placed.properties.id, 'Tuesdays']]),
  )
  const root = createRoot(document.createElement('div'))

  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe place={place} />
      </QueryClientProvider>,
    ),
  )
  expect(client.isFetching()).toBe(0)
  act(() => root.unmount())
}

describe('useNearbyClasses', () => {
  it('finds a listed class at the picked address, and offers its correction', async () => {
    await render({ label: 'x', latitude: lat + 0.0005, longitude: lng, location: {} })

    expect(found).toEqual([
      expect.objectContaining({ id: placed.properties.id, title: 'Tuesdays' }),
    ])
    expect(found[0].correctPath).toMatch(/\/correct$/)
  })

  it('stays quiet a street away, and before anything is picked', async () => {
    await render({ label: 'x', latitude: lat + 0.01, longitude: lng, location: {} })
    expect(found).toEqual([])

    await render(null)
    expect(found).toEqual([])
  })
})
