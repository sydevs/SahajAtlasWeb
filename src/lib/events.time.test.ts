import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { formatHour, formatTimePeriods } from './events'

// Intl puts a narrow no-break space before the day period.
const norm = (value: string) => value.replace(/\s+/g, ' ')

// The active-filter pill reads these. A UK browser once got "17:00 – 00:00" there while the class
// rows beside it said "7:30 pm London time".
describe('formatTimePeriods on a UK browser', () => {
  beforeEach(() => vi.stubGlobal('navigator', { languages: ['en-GB', 'en'] }))
  afterEach(() => vi.unstubAllGlobals())

  it('writes a time-of-day range in am/pm, like the class rows', () => {
    expect(norm(formatTimePeriods('en', ['evening']))).toBe('5:00 pm – 12:00 am')
  })

  it('merges touching periods into one range', () => {
    expect(norm(formatTimePeriods('en', ['afternoon', 'evening']))).toBe('12:00 pm – 12:00 am')
  })

  it('keeps each end’s own am or pm, also on a range across midnight', () => {
    // Morning and evening meet, or wrap, at midnight. Whichever, no end loses its day period.
    for (const range of norm(formatTimePeriods('en', ['morning', 'evening'])).split(' · ')) {
      expect(range).toMatch(/^\d{1,2}:\d\d [ap]m – \d{1,2}:\d\d [ap]m$/)
    }
  })

  it('keeps a 24-hour language on its own clock', () => {
    expect(norm(formatTimePeriods('de', ['evening']))).toMatch(/^17:00 – 0?0:00$/)
  })

  it('is empty with nothing chosen', () => {
    expect(formatTimePeriods('en', [])).toBe('')
  })

  it('reads a fractional hour as its minutes', () => {
    expect(norm(formatHour('en', 9.5))).toBe('9:30 am')
  })
})
