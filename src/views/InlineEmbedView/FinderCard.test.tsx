import type { GeoFeature } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FinderCard } from './FinderCard'

import { mockEventSlim } from '@/mocks/events'

// Node-only SSR assertions (`docs/testing.md`): what a newcomer reads off the inline card's rows
// before opening any of them.

const state = vi.hoisted(() => ({
  feed: undefined as { type: 'FeatureCollection'; features: unknown[] } | undefined,
  titles: undefined as Map<number, string> | undefined,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === 'geojson' ? state.feed : state.titles,
  }),
}))
vi.mock('@/config/api', () => ({
  default: { getGeojson: () => Promise.resolve(undefined) },
  eventTitlesQuery: (locale: string) => ({ queryKey: ['event-titles', locale] }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { place?: string }) =>
      options?.place ? `${key}(${options.place})` : key,
  }),
}))
vi.mock('@/hooks/use-locale', () => ({
  useLocale: () => ({
    locale: 'en',
    languageLabel: (code: string) => ({ cs: 'Czech', en: 'English' })[code] ?? code,
  }),
}))
vi.mock('@/hooks/use-ip-location', () => ({
  useIpLocation: () => ({
    city: 'Prague',
    country: 'Czechia',
    country_code: 'CZ',
    latitude: 50.0755,
    longitude: 14.4378,
  }),
}))
vi.mock('@/hooks/use-event-display', () => ({
  useEventDisplay: () => ({
    recurrenceLine: 'Every Monday',
    whenLine: '',
    eventStartTime: '7:00 pm',
    display: { next: null },
    whereLine: 'Lipanská 4, Praha 3',
  }),
  composeCalendarLine: () => 'Mondays · 7:00 pm',
}))

// A running weekly class, at a point and in a language of our choosing.
const { title: _title, path: _path, distance: _distance, ...base } = mockEventSlim
const feature = (id: number, at: [number, number], languages: string[]): GeoFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: at },
  properties: { ...base, id, languages, webPath: `/cz/${id}` },
})

const LIPANSKA: [number, number] = [14.4507, 50.0838]
const LIBEREC: [number, number] = [15.0562, 50.7663]

state.feed = {
  type: 'FeatureCollection',
  features: [
    feature(1, LIPANSKA, ['cs']),
    feature(2, LIPANSKA, ['en']),
    feature(3, LIBEREC, ['cs']),
  ],
}

const render = () => renderToStaticMarkup(<FinderCard onOpen={() => {}} />)

describe('FinderCard rows', () => {
  it('names each class, so two at one address can be told apart', () => {
    state.titles = new Map([
      [1, 'Úvod do meditace'],
      [2, 'Meditation for everyone in English'],
      [3, 'Meditace v Liberci'],
    ])
    const html = render()

    expect(html).toContain('Úvod do meditace')
    expect(html).toContain('Meditation for everyone in English')
  })

  it('says each class’s language until the names arrive', () => {
    state.titles = undefined
    const html = render()

    expect(html).toContain('>Czech<')
    expect(html).toContain('>English<')
  })

  it('sets a class in another city apart, under its own heading after the near ones', () => {
    state.titles = new Map([
      [1, 'Úvod do meditace'],
      [2, 'Meditation for everyone in English'],
      [3, 'Meditace v Liberci'],
    ])
    const html = render()
    const heading = html.indexOf('search.sections.nearby')

    expect(html.split('search.sections.nearby')).toHaveLength(2)
    expect(heading).toBeGreaterThan(html.indexOf('Meditation for everyone in English'))
    expect(heading).toBeLessThan(html.indexOf('Meditace v Liberci'))
  })
})
