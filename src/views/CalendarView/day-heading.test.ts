import type { TFunction } from 'i18next'

import { DateTime } from 'luxon'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dayHeadingParts } from './day-heading'

import snapshot from '@/config/translations.en.json'

// The snapshot's English, with `%{var}` filled and `count` picking `_one` or `_other`.
const t = ((key: string, options: Record<string, unknown> = {}) => {
  const plural =
    typeof options.count === 'number' ? `${key}_${options.count === 1 ? 'one' : 'other'}` : key
  const value = plural
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], snapshot)

  return String(value).replace(/%\{(\w+)\}/g, (_, name: string) => String(options[name]))
}) as unknown as TFunction

const day = (iso: string) => DateTime.fromISO(iso)

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 12, 10) })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dayHeadingParts', () => {
  it('leads with the compact date, with Today and the count on the quieter line', () => {
    expect(dayHeadingParts(day('2026-11-12'), { count: 4, locale: 'en-US', t })).toEqual({
      heading: 'Thursday, Nov 12',
      note: 'Today · 4 classes',
    })
  })

  it('writes the date the visitor’s way, and one class in the singular', () => {
    expect(dayHeadingParts(day('2026-11-13'), { count: 1, locale: 'en-GB', t })).toEqual({
      heading: 'Friday 13 Nov',
      note: 'Tomorrow · 1 class',
    })
  })

  it('says only the count on a later day, and nothing for a day with no classes', () => {
    expect(dayHeadingParts(day('2026-11-16'), { count: 2, locale: 'en-GB', t }).note).toBe(
      '2 classes',
    )
    expect(dayHeadingParts(day('2026-11-16'), { count: 0, locale: 'en-GB', t }).note).toBe('')
    expect(dayHeadingParts(day('2026-11-12'), { count: 0, locale: 'en-GB', t }).note).toBe('Today')
  })

  it('says Today in the page’s own language', () => {
    expect(dayHeadingParts(day('2026-11-12'), { count: 0, locale: 'de', t }).note).toBe('Heute')
  })
})
