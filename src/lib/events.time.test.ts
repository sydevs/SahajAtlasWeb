import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatTimePeriods } from './events'

// Intl puts a narrow no-break space before the day period.
const norm = (value: string) => value.replace(/\s+/g, ' ')

// The filter readout and the active-filter pill read these, in the same clock as the class rows
// beside them: the visitor's own, as Intl writes it.
describe('formatTimePeriods', () => {
  afterEach(() => vi.unstubAllGlobals())

  const browser = (languages: string[]) => vi.stubGlobal('navigator', { languages })

  it('writes a time-of-day range in the visitor’s own clock', () => {
    browser(['en-GB', 'en'])
    expect(formatTimePeriods('en', ['evening'])).toBe('17:00–21:00')

    browser(['en-US', 'en'])
    expect(norm(formatTimePeriods('en', ['evening']))).toBe('5:00 – 9:00 PM')
  })

  it('merges touching periods into one range', () => {
    browser(['en-GB', 'en'])
    expect(formatTimePeriods('en', ['afternoon', 'evening'])).toBe('12:00–21:00')
  })

  // Evening, night and morning run 5 PM to noon: `formatRange` alone writes "5:00 – 12:00 PM".
  it('keeps each end’s day period on a range past midnight of twelve hours or more', () => {
    browser(['en-US', 'en'])
    expect(norm(formatTimePeriods('en', ['evening', 'night', 'morning']))).toBe(
      '5:00 PM – 12:00 PM',
    )

    browser(['en-GB', 'en'])
    expect(formatTimePeriods('en', ['evening', 'night', 'morning'])).toBe('17:00–12:00')
  })

  it('keeps an overnight range under twelve hours to its own pattern', () => {
    browser(['en-US', 'en'])
    expect(norm(formatTimePeriods('en', ['night']))).toBe('9:00 PM – 6:00 AM')
  })

  it('follows a browser whose first language is not the page’s', () => {
    browser(['de-DE', 'de', 'en-US', 'en'])
    expect(formatTimePeriods('en', ['evening'])).toBe('17:00–21:00')
  })

  it('is empty with nothing chosen', () => {
    expect(formatTimePeriods('en', [])).toBe('')
  })
})
