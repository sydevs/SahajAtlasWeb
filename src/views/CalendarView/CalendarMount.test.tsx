// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createCalendar, createViewMonthGrid } from '@schedule-x/calendar'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CalendarMount } from './CalendarMount'

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
    const calendar = createCalendar({ views: [createViewMonthGrid()], selectedDate: '2026-10-19' })
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
