import type { CalendarEntry } from '@/lib/shape'

import { describe, expect, it } from 'vitest'

import { showsOnline } from './TimesNote'

const entry = (start: string, online: boolean): CalendarEntry => ({
  id: start,
  title: 'Evening Meditation',
  start,
  end: start,
  path: '/x',
  calendarId: online ? 'online' : undefined,
})

describe('showsOnline', () => {
  it('is true only when the month in focus holds an online entry', () => {
    const entries = [entry('2026-07-15 19:30', false), entry('2026-08-03 01:00', true)]

    expect(showsOnline(entries, '2026-08-20')).toBe(true)
    expect(showsOnline(entries, '2026-07-20')).toBe(false)
  })
})
