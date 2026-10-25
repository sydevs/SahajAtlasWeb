import { describe, expect, it } from 'vitest'

import { blockingSections, changedSections } from './sections'

import { emptyDraft } from '@/lib/proposal'

const place = { label: '12 Church Road, Hove', city: 'Hove', location: {} }

describe('blockingSections', () => {
  it('holds a new listing at Where and When until both are filled', () => {
    expect(blockingSections(emptyDraft('Europe/London'))).toEqual(['where', 'when'])
  })

  it('checks an optional section only once something in it is wrong', () => {
    const draft = {
      ...emptyDraft('Europe/London'),
      address: place,
      firstDate: '2026-11-03',
      startTime: '19:30',
    }

    expect(blockingSections(draft)).toEqual([])
    expect(blockingSections({ ...draft, contactEmail: 'not-an-address' })).toEqual(['contact'])
    expect(blockingSections({ ...draft, website: 'church.example' })).toEqual(['contact'])
  })

  it('lets a correction fix one thing on a class whose other parts were never complete', () => {
    // A published class with no schedule at all: fixing its phone must not demand a time.
    const base = { ...emptyDraft('Europe/London'), address: place }

    expect(blockingSections({ ...base, contactPhone: '01273 000000' }, base)).toEqual([])
  })
})

describe('changedSections', () => {
  it('lists what a correction touched, in the order the listing reads', () => {
    const base = { ...emptyDraft('Europe/London', ['en']), address: place, startTime: '19:15' }
    const draft = {
      ...base,
      startTime: '19:30',
      title: 'Tuesday evenings',
      languages: ['en', 'fr'],
    }

    expect(changedSections(draft, base)).toEqual(['title', 'more', 'when'])
    expect(changedSections(base, base)).toEqual([])
  })
})
