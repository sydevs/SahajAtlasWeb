import type { TFunction } from 'i18next'

import { DateTime } from 'luxon'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { dayHeadingParts } from './day-heading'

import { englishT } from '@/test-support/english-t'

let t: TFunction

beforeAll(async () => {
  t = await englishT()
})

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
