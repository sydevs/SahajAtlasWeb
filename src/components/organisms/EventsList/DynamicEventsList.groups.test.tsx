import type { BBox } from 'geojson'
import type { EventSlim } from '@/types'

import { DateTime } from 'luxon'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { DynamicEventsList } from './DynamicEventsList'

import { eventsQuery } from '@/config/api'
import { DEFAULT_FILTERS, filtersFromParams } from '@/lib/shape'
import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`) of what the results list renders for a searched
// place, from a seeded cache: the same `eventsQuery` keys the SearchView story seeds. i18next
// echoes the key with its count, and the card's own facts and chips (which this does not assert)
// are stubbed to the card's title.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
    i18n: { language: 'en' },
  }),
}))
vi.mock('@/components/molecules/EventSummary', () => ({
  EventSummary: ({ event }: { event: EventSlim }) => <b>{event.title}</b>,
}))

// Brighton's centre, and a town-sized box around it.
const CENTER = { latitude: 50.82, longitude: -0.14 }
const BOX: BBox = [-0.25, 50.79, -0.02, 50.87]

const at = (days: number) => DateTime.now().plus({ days }).set({ hour: 19, minute: 0 }).toJSDate()

const classAt = (id: number, distance: number, inDays: number): EventSlim => ({
  ...mockEventSlim,
  id,
  title: `Class ${id}`,
  path: `/gb/south-east/brighton/${id}`,
  distance,
  address: {
    ...mockEventSlim.address,
    city: 'Brighton',
    latitude: CENTER.latitude,
    longitude: CENTER.longitude + distance / 70,
  },
  schedule: {
    ...mockEventSlim.schedule!,
    recurrenceType: undefined,
    firstDate: at(inDays),
    upcomingDates: [at(inDays)],
  },
})

// In Brighton: 1 is nearest but latest, 2 is in between, 3 is farthest but soonest.
const NEAR_LATE = classAt(1, 0.5, 9)
const MIDDLE = classAt(2, 1, 5)
const FAR_SOON = classAt(3, 2, 1)

const list = (search: string, filtered: EventSlim[], unfiltered = filtered) => {
  const client = new QueryClient()
  const filters = filtersFromParams(new URLSearchParams(search))

  client.setQueryData(
    eventsQuery(CENTER.latitude, CENTER.longitude, filters, 'en').queryKey,
    filtered,
  )
  client.setQueryData(
    eventsQuery(CENTER.latitude, CENTER.longitude, DEFAULT_FILTERS, 'en').queryKey,
    unfiltered,
  )

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/search?q=Brighton&center=-0.14,50.82&${search}`]}>
      <QueryClientProvider client={client}>
        <DynamicEventsList hasSearchCenter bbox={BOX} {...CENTER} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** The class titles in the order the list draws them. */
const order = (html: string) => [...html.matchAll(/<b>(Class \d+)<\/b>/g)].map((match) => match[1])

const ALL = [MIDDLE, FAR_SOON, NEAR_LATE]

describe('DynamicEventsList — a searched place', () => {
  // The groups come first and the visitor's order applies inside each (Devindra, 12 Nov): an order
  // applied before the split would be undone by it, leaving every group nearest first.
  it("orders the place's own classes by the order the visitor chose", () => {
    expect(order(list('sort=soonest', ALL))).toEqual(['Class 3', 'Class 2', 'Class 1'])
    expect(order(list('sort=closest', ALL))).toEqual(['Class 1', 'Class 2', 'Class 3'])
  })
})

describe('DynamicEventsList — what the filters hide', () => {
  // "N more classes in this area · Remove filters" counts what removing them all gives back, so
  // the number and the button agree (Devindra, 12 Nov).
  it('counts the classes in the area the filters leave out, and offers to remove them', () => {
    const html = list('days=2', [MIDDLE], ALL)

    expect(html).toContain('search.filtered.more_area:2')
    expect(html).toContain('search.filtered.remove_all')
  })

  it('says nothing when the filters hide nothing here', () => {
    expect(list('days=2', ALL)).not.toContain('search.filtered.more_area')
  })

  it('says nothing without a filter', () => {
    expect(list('', [MIDDLE], ALL)).not.toContain('search.filtered.more_area')
  })
})
