import { describe, expect, it } from 'vitest'

import { formatTimePeriods } from './events'

// Intl puts a narrow no-break space before the day period.
const norm = (value: string) => value.replace(/\s+/g, ' ')

// The filter readout and the active-filter pill write these like the class rows beside them.
describe('formatTimePeriods', () => {
  it('writes each chosen range in the visitor’s clock, joined into one line', () => {
    expect(formatTimePeriods('en-GB', ['morning', 'evening'])).toBe('06:00–12:00 · 17:00–21:00')
    expect(norm(formatTimePeriods('en-US', ['morning', 'evening']))).toBe(
      '6:00 AM – 12:00 PM · 5:00 – 9:00 PM',
    )
  })

  // Evening, night and morning run 5 PM to noon: `formatRange` alone writes "5:00 – 12:00 PM".
  it('keeps each end’s day period on a range past midnight of twelve hours or more', () => {
    expect(norm(formatTimePeriods('en-US', ['evening', 'night', 'morning']))).toBe(
      '5:00 PM – 12:00 PM',
    )
    expect(formatTimePeriods('en-GB', ['evening', 'night', 'morning'])).toBe('17:00–12:00')
  })

  it('is empty with nothing chosen', () => {
    expect(formatTimePeriods('en-GB', [])).toBe('')
  })
})
