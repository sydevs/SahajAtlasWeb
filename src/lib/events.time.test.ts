import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatHour, formatTimePeriods } from './events'

// Intl puts a narrow no-break space before the day period.
const norm = (value: string) => value.replace(/\s+/g, ' ')

// The active-filter pill reads these, in the same clock as the class rows beside it: each locale's
// own, as Intl writes it (Devindra, 12 Nov).
describe('formatTimePeriods', () => {
  afterEach(() => vi.unstubAllGlobals())

  const browser = (languages: string[]) => vi.stubGlobal('navigator', { languages })

  it('writes a time-of-day range in the visitor’s own clock', () => {
    browser(['en-GB', 'en'])
    expect(formatTimePeriods('en', ['evening'])).toBe('17:00–00:00')

    browser(['en-US', 'en'])
    expect(norm(formatTimePeriods('en', ['evening']))).toBe('5:00 PM – 12:00 AM')
  })

  it('merges touching periods into one range', () => {
    browser(['en-GB', 'en'])
    expect(formatTimePeriods('en', ['afternoon', 'evening'])).toBe('12:00–00:00')
  })

  it('keeps each end’s own AM or PM, also on a range across midnight', () => {
    browser(['en-US', 'en'])
    for (const range of norm(formatTimePeriods('en', ['morning', 'evening'])).split(' · ')) {
      expect(range).toMatch(/^\d{1,2}:\d\d [AP]M – \d{1,2}:\d\d [AP]M$/)
    }
  })

  // The interface's words, on the visitor's clock: a German page reads AM/PM for a US browser.
  it('keeps the visitor’s clock under another interface language', () => {
    browser(['en-GB', 'en'])
    expect(norm(formatTimePeriods('de', ['evening']))).toBe('17:00–00:00 Uhr')

    browser(['en-US', 'en'])
    expect(norm(formatTimePeriods('de', ['evening']))).toBe('5:00 PM – 12:00 AM')
  })

  it('is empty with nothing chosen', () => {
    expect(formatTimePeriods('en', [])).toBe('')
  })

  it('reads a fractional hour as its minutes', () => {
    browser(['en-US', 'en'])
    expect(norm(formatHour('en', 9.5))).toBe('9:30 AM')
  })
})
