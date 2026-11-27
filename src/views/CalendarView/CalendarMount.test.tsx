// @vitest-environment jsdom
import type { CalendarEntry } from '@/lib/shape'

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createCalendar, createViewMonthAgenda, createViewMonthGrid } from '@schedule-x/calendar'
import { Temporal } from 'temporal-polyfill'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CalendarMount } from './CalendarMount'
import { calendarRenderers } from './renderers'
import { scheduleXTimeline } from './timeline'

/**
 * The calendar's grid inside the embed's shadow root.
 *
 * jsdom, because the defect IS the shadow boundary: `ScheduleXCalendar` looked its mount point
 * up with `document.getElementById`, found nothing through the root, and rendered no grid under
 * a header that rendered fine. A real Schedule-X instance, so the patched core's own lookups are
 * exercised through the same root (`src/lib/shadow-patches.test.ts` pins that patch).
 */

afterEach(() => {
  document.body.innerHTML = ''
})

function shadowContainer() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  const root = host.attachShadow({ mode: 'open' })
  const container = document.createElement('div')

  root.append(container)

  return { root, container }
}

describe('CalendarMount', () => {
  it('renders the month grid inside a shadow root', async () => {
    const { root, container } = shadowContainer()
    const calendar = createCalendar({
      views: [createViewMonthGrid()],
      selectedDate: Temporal.PlainDate.from('2026-10-19'),
    })
    const reactRoot = createRoot(container)

    await act(async () => {
      reactRoot.render(createElement(CalendarMount, { calendar }))
    })

    await vi.waitFor(() => {
      expect(root.querySelector('.sx__view-container .sx__month-grid-wrapper')).not.toBeNull()
    })

    await act(async () => {
      reactRoot.unmount()
    })
  })

  // The renderers reach Schedule-X through an underscored hook, so this is what fails when an
  // upgrade closes it: the rows would fall back to Schedule-X's own, titled by place.
  it.each([
    ['month-agenda', '.sx__month-agenda-event', ['Evening meditation', '19:00–20:00 · Harrogate']],
    ['month-grid', '.sy-entry-cell', ['19:00 Harrogate']],
  ])(
    "draws Schedule-X's %s entries with the renderers it is given",
    async (view, selector, lines) => {
      const { root, container } = shadowContainer()
      const entry: CalendarEntry = {
        id: '1',
        title: 'Evening meditation\nHarrogate',
        name: 'Evening meditation',
        detail: 'Harrogate',
        start: '2026-10-19 19:00',
        end: '2026-10-19 20:00',
        path: '/1',
      }
      const calendar = createCalendar({
        views: [createViewMonthAgenda(), createViewMonthGrid()],
        defaultView: view,
        isResponsive: false,
        selectedDate: Temporal.PlainDate.from('2026-10-19'),
        ...scheduleXTimeline([entry], 'UTC'),
      })
      const reactRoot = createRoot(container)

      await act(async () => {
        reactRoot.render(
          createElement(CalendarMount, { calendar, renderers: calendarRenderers('en-GB') }),
        )
      })

      await vi.waitFor(() => {
        expect(root.querySelector(selector)).not.toBeNull()
      })

      const drawn = root.querySelector<HTMLElement>(selector)
      const texts = drawn?.children.length
        ? [...drawn.children].map((line) => line.textContent)
        : [drawn?.textContent]

      expect(texts).toEqual(lines)
      if (view === 'month-grid') expect(drawn?.title).toBe('Evening meditation · Harrogate')

      await act(async () => {
        reactRoot.unmount()
      })
    },
  )

  it('tears the calendar down on unmount, and waits for one before rendering', async () => {
    const { container } = shadowContainer()
    const calendar = { render: vi.fn(), destroy: vi.fn() }
    const reactRoot = createRoot(container)

    await act(async () => {
      reactRoot.render(createElement(CalendarMount, { calendar: null }))
    })
    expect(calendar.render).not.toHaveBeenCalled()

    await act(async () => {
      reactRoot.render(
        createElement(CalendarMount, { calendar: calendar as unknown as CalendarMountApp }),
      )
    })
    expect(calendar.render).toHaveBeenCalledWith(container.firstElementChild)

    await act(async () => {
      reactRoot.unmount()
    })
    expect(calendar.destroy).toHaveBeenCalledOnce()
  })
})

type CalendarMountApp = NonNullable<Parameters<typeof CalendarMount>[0]['calendar']>
