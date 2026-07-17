import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'

import { isSoon } from './events'

describe('isSoon', () => {
  it('is true for an online event within the next hour', () => {
    expect(isSoon(DateTime.now().plus({ minutes: 30 }), true)).toBe(true)
  })

  it('is false for an online event more than an hour away', () => {
    expect(isSoon(DateTime.now().plus({ hours: 2 }), true)).toBe(false)
  })

  it('is true for an in-person event within the next week', () => {
    expect(isSoon(DateTime.now().plus({ days: 3 }), false)).toBe(true)
  })

  it('is false for an in-person event more than a week away', () => {
    expect(isSoon(DateTime.now().plus({ weeks: 2 }), false)).toBe(false)
  })

  it('is false for a date in the past', () => {
    expect(isSoon(DateTime.now().minus({ minutes: 30 }), true)).toBe(false)
    expect(isSoon(DateTime.now().minus({ days: 1 }), false)).toBe(false)
  })
})
