import type { CalendarEntry } from '@/lib/shape'

import { Settings } from 'luxon'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TimesNote } from './TimesNote'

import snapshot from '@/config/translations.en.json'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options: Record<string, string> = {}) =>
      (
        key
          .split('.')
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)?.[part],
            snapshot,
          ) as string
      ).replace(/%\{(\w+)\}/g, (_, name: string) => options[name]),
  }),
}))

const entry = (start: string, zone: string, online = false): CalendarEntry => ({
  id: `${zone}-${start}`,
  title: 'Evening Meditation',
  name: 'Evening Meditation',
  start,
  end: start,
  path: '/x',
  zone,
  ...(online ? { calendarId: 'online' } : {}),
})

// The text a viewer reads, with the markup and entities gone.
const note = (entries: CalendarEntry[]) =>
  renderToStaticMarkup(
    createElement(TimesNote, { entries, start: '2026-11-06', end: '2026-11-12' }),
  )
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;/g, "'")

describe('TimesNote', () => {
  afterEach(() => {
    Settings.defaultZone = 'system'
  })

  const london = entry('2026-11-09 19:30', 'Europe/London')

  it('names the clock even when it is the viewer’s own', () => {
    // A London viewer used to get no note: it compared offsets today, not on the class's day.
    Settings.defaultZone = 'Europe/London'

    expect(note([london])).toBe('Times are London time.')
  })

  it('says one clock once, when the online classes are read on that same clock', () => {
    expect(note([london, entry('2026-11-10 20:00', 'Europe/London', true)])).toBe(
      'Times are London time.',
    )
  })

  it('names the online clock beside the in-person one when they differ', () => {
    expect(note([london, entry('2026-11-10 20:00', 'Europe/Prague', true)])).toBe(
      'Times are London time. Online classes are in Prague time.',
    )
  })

  it("falls back to each class's own clock across zones", () => {
    expect(note([london, entry('2026-11-10 19:00', 'Europe/Dublin')])).toBe(
      'Times are each class’s local time.',
    )
  })

  it('names the online clock alone when only online classes are on screen', () => {
    expect(note([entry('2026-11-10 20:00', 'Europe/Prague', true)])).toBe('Times are Prague time.')
  })

  it('says nothing with no class on screen', () => {
    expect(note([entry('2026-12-01 19:30', 'Europe/London')])).toBe('')
  })
})
