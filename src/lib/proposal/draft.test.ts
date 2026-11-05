import { describe, expect, it } from 'vitest'

import { draftPlaceName, emptyDraft, titleSlot } from './draft'

const draft = emptyDraft('Europe/London', ['en'])
const address = { street: '12 Church Road, Hove' } as NonNullable<typeof draft.address>

// These mirror SahajCloud's `eventTitle/compose.ts`, so Check states the title it will publish.
describe('the auto-title a blank class name gets', () => {
  it('picks the time of day from the local start', () => {
    expect(titleSlot('07:30')).toBe('morning')
    expect(titleSlot('12:00')).toBe('afternoon')
    expect(titleSlot('19:00')).toBe('evening')
    expect(titleSlot('22:00')).toBe('default')
    expect(titleSlot('')).toBe('default')
  })

  it('names the building, else the first part of the street', () => {
    expect(draftPlaceName({ ...draft, address })).toBe('12 Church Road')
    expect(draftPlaceName({ ...draft, address, venueName: ' Hove Hall ' })).toBe('Hove Hall')
  })
})
