// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { useFeedHints } from './use-feed-hints'

import { GEOJSON_QUERY_KEY } from '@/config/api/fetch'
import { mockGeojson } from '@/mocks/regions'

// Whether the hints follow the feed into the cache is a re-render, which only a mounted
// observer shows.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let hints: ReturnType<typeof useFeedHints> | undefined

function Probe() {
  hints = useFeedHints()

  return null
}

describe('useFeedHints', () => {
  it('picks the feed up when it lands after the panel opened, without fetching it', async () => {
    const client = new QueryClient()
    const root = createRoot(document.createElement('div'))

    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      ),
    )
    expect(hints?.languages).toEqual([])
    expect(client.isFetching()).toBe(0)

    const [placed, ...rest] = mockGeojson.features
    const zoned = {
      ...placed,
      properties: {
        ...placed.properties,
        schedule: { ...placed.properties.schedule!, firstDate_tz: 'Europe/London' },
      },
    }

    await act(async () => {
      client.setQueryData(GEOJSON_QUERY_KEY, { ...mockGeojson, features: [zoned, ...rest] })
      // React Query notifies its observers on a timeout, not a microtask.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(hints?.languages).toContain('en')
    expect(hints?.points).toEqual([
      { position: placed.geometry!.coordinates, timeZone: 'Europe/London' },
    ])

    act(() => root.unmount())
  })
})
