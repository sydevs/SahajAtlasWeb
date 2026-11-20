// @vitest-environment jsdom
import type { CalendarEntry } from '@/lib/shape'

import { act } from 'react'
import { Settings } from 'luxon'
import { createCalendar, createViewMonthGrid } from '@schedule-x/calendar'
import { Temporal } from 'temporal-polyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { scheduleXTimeline } from './timeline'

let id = 0

const entry = (start: string, end: string): CalendarEntry => ({
  id: String(++id),
  title: 'Meditation',
  start,
  end,
  path: '/1',
})

afterEach(() => {
  Settings.defaultZone = 'system'
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('scheduleXTimeline', () => {
  // CI runs in UTC, where Schedule-X's own UTC default looks right. A Los Angeles viewer at
  // 23:30 is already on the 20th in UTC: without the viewer's zone, the grid lights the 20th as
  // today and draws a 19:00 class at 3:00 AM the next day.
  it('draws the grid in the viewer’s clock, each entry at its own wall clock', async () => {
    Settings.defaultZone = 'America/Los_Angeles'
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-20T07:30:00Z') })

    const container = document.createElement('div')

    document.body.append(container)

    const calendar = createCalendar({
      views: [createViewMonthGrid()],
      selectedDate: Temporal.PlainDate.from('2026-11-19'),
      ...scheduleXTimeline([entry('2026-11-19 19:00', '2026-11-19 20:00')]),
    })

    await act(async () => {
      calendar.render(container)
    })

    await vi.waitFor(() => {
      expect(container.querySelector('.sx__month-grid-event-time')?.textContent).toBe('7:00 PM')
    })
    expect(container.querySelector('.sx__is-today')?.textContent).toBe('19')

    const day = container.querySelector('.sx__month-grid-event')?.closest('[data-date]')

    expect(day?.getAttribute('data-date')).toBe('2026-11-19')

    await act(async () => {
      calendar.destroy()
    })
  })

  // Schedule-X reads an entry's string thousands of times over a full feed.
  it('formats each time once, and still formats on request', () => {
    const [event] = scheduleXTimeline(
      [entry('2026-11-19 19:00', '2026-11-19 20:00')],
      'Europe/London',
    ).events
    const format = vi.spyOn(Temporal.ZonedDateTime.prototype, 'toString')

    expect(event.start).toBeInstanceOf(Temporal.ZonedDateTime)
    expect(event.start.toString()).toBe('2026-11-19T19:00:00+00:00[Europe/London]')
    expect(event.start.toString()).toBe('2026-11-19T19:00:00+00:00[Europe/London]')
    expect(format).toHaveBeenCalledOnce()
    expect(event.start.toString({ timeZoneName: 'never' })).toBe('2026-11-19T19:00:00+00:00')
  })

  // London springs forward at 01:00 on 2027-03-28, so 01:30 does not exist there.
  it('keeps an entry that starts in the spring-forward gap the right way round', () => {
    const [event] = scheduleXTimeline(
      [entry('2027-03-28 01:30', '2027-03-28 02:00')],
      'Europe/London',
    ).events

    expect(Temporal.ZonedDateTime.compare(event.start, event.end)).toBe(-1)
    expect(event.start.until(event.end).total('minutes')).toBe(30)
  })

  it('anchors every other wall clock exactly', () => {
    const { timezone, events } = scheduleXTimeline(
      [
        entry('2026-11-19 19:00', '2026-11-19 20:30'),
        entry('2027-03-28 00:30', '2027-03-28 03:30'),
      ],
      'Europe/London',
    )

    expect(timezone).toBe('Europe/London')
    expect(
      events.map((e) => [e.start.toPlainDateTime().toString(), e.end.toPlainDateTime().toString()]),
    ).toEqual([
      ['2026-11-19T19:00:00', '2026-11-19T20:30:00'],
      ['2027-03-28T00:30:00', '2027-03-28T03:30:00'],
    ])
  })
})
