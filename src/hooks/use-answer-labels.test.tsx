import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { useAnswerLabels } from './use-answer-labels'

import { DEFAULT_FILTERS, type EventFilters } from '@/lib/shape'

// Node-only SSR, on the English snapshot the widget boots from.

const labelsOf = (filters: Partial<EventFilters>) => {
  let labels: ReturnType<typeof useAnswerLabels> | undefined
  const Probe = () => {
    labels = useAnswerLabels({ ...DEFAULT_FILTERS, ...filters })

    return null
  }

  renderToStaticMarkup(<Probe />)

  return labels!
}

describe('useAnswerLabels', () => {
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

  it('leaves every open question empty', () => {
    expect(Object.values(labelsOf({})).every((label) => label === '')).toBe(true)
  })
})
