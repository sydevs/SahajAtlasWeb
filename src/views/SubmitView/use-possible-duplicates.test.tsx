// @vitest-environment jsdom
import type { DuplicateClass } from '@/components/organisms/ProposalForm/DuplicateNotice'
import type { PickedPlace } from '@/lib/proposal'
import type { EventSchedule } from '@/types'

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { usePossibleDuplicates } from './use-possible-duplicates'

import { GEOJSON_QUERY_KEY, eventTitlesQuery } from '@/config/api/fetch'
import { mockGeojson } from '@/mocks/regions'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))

let found: DuplicateClass[] = []

function Probe({ place, schedule }: { place: PickedPlace | null; schedule: EventSchedule }) {
  found = usePossibleDuplicates(place, schedule)

  return null
}

const placed = mockGeojson.features.find(
  (feature) => feature.geometry && feature.properties.eventType !== 'online',
)!
const [lng, lat] = placed.geometry!.coordinates
/** A weekly class meeting on Tuesdays at 18:00, as listed — and a new one on Wednesday mornings. */
const sameTime: EventSchedule = {
  firstDate: new Date('2027-03-02T18:00Z'),
  firstDate_tz: 'Europe/London',
  endTime: '19:30',
  recurrenceType: 'WEEKLY',
  upcomingDates: [new Date('2027-03-02T18:00Z')],
}
const otherTime: EventSchedule = {
  ...sameTime,
  firstDate: new Date('2027-03-03T08:00Z'),
  endTime: '09:30',
  upcomingDates: [new Date('2027-03-03T08:00Z')],
}

const render = async (place: PickedPlace | null, schedule: EventSchedule) => {
  const client = new QueryClient()
  const feed = {
    ...mockGeojson,
    features: [{ ...placed, properties: { ...placed.properties, schedule: sameTime } }],
  }

  client.setQueryData(GEOJSON_QUERY_KEY, feed)
  client.setQueryData(
    eventTitlesQuery('en').queryKey,
    new Map([[placed.properties.id, 'Tuesdays']]),
  )
  const root = createRoot(document.createElement('div'))

  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe place={place} schedule={schedule} />
      </QueryClientProvider>,
    ),
  )
  expect(client.isFetching()).toBe(0)
  act(() => root.unmount())
}

const door: PickedPlace = { label: 'x', latitude: lat + 0.0005, longitude: lng, location: {} }

describe('usePossibleDuplicates', () => {
  it('names a listed class at the same place and time, with a link to its page', async () => {
    await render(door, sameTime)

    expect(found).toEqual([
      expect.objectContaining({ id: placed.properties.id, title: 'Tuesdays' }),
    ])
    expect(found[0].path).not.toMatch(/\/correct$/)
  })

  it('stays quiet for the same place at another time, a street away, or with no place', async () => {
    await render(door, otherTime)
    expect(found).toEqual([])

    await render({ ...door, latitude: lat + 0.01 }, sameTime)
    expect(found).toEqual([])

    await render(null, sameTime)
    expect(found).toEqual([])
  })
})
