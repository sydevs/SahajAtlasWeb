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
  renderToStaticMarkup(createElement(TimesNote, { entries }))
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;/g, "'")

// The calendar's clock note follows the class pages' rule (#380): it speaks only when an online
// class, read in the viewer's zone, sits among in-person classes read in their own.
describe('TimesNote', () => {
  afterEach(() => {
    Settings.defaultZone = 'system'
  })

  const london = entry('2026-11-09 19:30', 'Europe/London')

  it('says nothing when only in-person classes are listed', () => {
    Settings.defaultZone = 'Europe/Prague'

    expect(note([london])).toBe('')
  })

  it("names the viewer's city once an online class is listed", () => {
    Settings.defaultZone = 'Europe/Prague'

    expect(note([london, entry('2026-11-10 20:00', 'Europe/Prague', true)])).toBe(
      'Times are local to each class. Online classes show your time (Prague).',
    )
  })

  it('says nothing with no class listed', () => {
    expect(note([])).toBe('')
  })
})
