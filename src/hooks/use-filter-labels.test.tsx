import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { useFilterLabels } from './use-filter-labels'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

// Node-only SSR, on the English snapshot the widget boots from.

const labelsOf = (filters: Partial<EventFilters>, width?: 'long' | 'short') => {
  let labels: ReturnType<typeof useFilterLabels> | undefined
  const Probe = () => {
    labels = useFilterLabels({ ...DEFAULT_FILTERS, ...filters }, width)

    return null
  }

  renderToStaticMarkup(<Probe />)

  return labels!
}

describe('useFilterLabels', () => {
  it('names each answered question once, short days first-to-last as chosen', () => {
    expect(
      labelsOf({
        format: 'online',
        daysOfWeek: [2, 3],
        timeOfDay: ['evening'],
        cadence: 'WEEKLY',
        languages: ['en', 'fr'],
        dateRange: { start: '2026-12-01', end: null },
      }),
    ).toEqual({
      format: 'Online',
      days: 'Tue, Wed',
      time: 'Evening',
      cadence: 'Weekly',
      languages: 'English, French',
      dates: 'Date',
    })
  })

  it('names the days in full where the sentence is prose, not a chip', () => {
    expect(labelsOf({ daysOfWeek: [1, 7] }, 'long').days).toBe('Monday, Sunday')
  })

  it('leaves every open question empty', () => {
    expect(Object.values(labelsOf({})).every((label) => label === '')).toBe(true)
  })
})
