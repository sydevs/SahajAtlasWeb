import type { GeoFeature } from '@/types'

import { describe, expect, it } from 'vitest'

import {
  SAMPLE_PLACE,
  SAMPLE_SIGNUP_LINK,
  copyPlaceAndTime,
  draftPreviewSchedule,
  emptyDraft,
  firstInvalidStep,
  possibleDuplicates,
  sampleDraft,
  stepErrors,
} from '.'

const blank = emptyDraft('Europe/Prague', ['en'])
/** A Monday, so the first Thursday is three days on. */
const TODAY = '2026-11-16'

describe('sampleDraft', () => {
  it('opens Place blank', () => {
    expect(sampleDraft(blank, { step: 'where' }, TODAY)).toEqual(blank)
  })

  it('answers Place before Time, and nothing on Time itself', () => {
    const draft = sampleDraft(blank, { step: 'when' }, TODAY)

    expect(draft.address).toBe(SAMPLE_PLACE)
    expect(draft.timeZone).toBe('Europe/London')
    expect(draft.startTime).toBe('')
    expect(stepErrors('where', draft)).toEqual({})
  })

  it('answers Place and Time before Details, starting on the next Thursday', () => {
    const draft = sampleDraft(blank, { step: 'details' }, TODAY)

    expect(draft).toMatchObject({ repeats: 'weekly', firstDate: '2026-11-19', startTime: '19:00' })
    expect(draft.title).toBe('')
    expect(stepErrors('when', draft)).toEqual({})
  })

  it('answers everything for Check, so it can be sent as it stands', () => {
    const draft = sampleDraft(blank, { step: 'review' }, TODAY)

    expect(draft.title).not.toBe('')
    expect(draft.languages).toEqual(['en'])
    expect(firstInvalidStep(draft)).toBeNull()
  })

  it('chooses the sign-up answer a link names, with a Meetup link for "elsewhere"', () => {
    const draft = sampleDraft(blank, { step: 'details', signup: 'elsewhere' }, TODAY)

    expect(draft.signup).toBe('elsewhere')
    expect(draft.website).toBe(SAMPLE_SIGNUP_LINK)
    expect(stepErrors('details', draft)).toEqual({})
  })
})

describe('copyPlaceAndTime', () => {
  // Balham Library's Wednesday class, as the live feed carried it on 12 Nov 2026.
  const balham: GeoFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-0.1521182, 51.4454169] },
    properties: {
      id: 939,
      eventType: 'offline',
      languages: ['en'],
      address: { street: '16 Ramsden Rd', city: 'London', postCode: 'SW12 8QY', country: 'GB' },
      schedule: {
        firstDate: new Date('2023-11-08T19:30:00Z'),
        firstDate_tz: 'Europe/London',
        endTime: '20:45',
        recurrenceType: 'WEEKLY',
        weekdays: ['WE'],
        upcomingDates: [new Date('2026-11-18T19:30:00Z'), new Date('2026-11-25T19:30:00Z')],
      },
      region: { id: 1258, slug: 'balham-library', name: 'Balham Library', level: 'venue' },
    },
  }

  it('takes the class’s place and its weekly time, from its next session on', () => {
    const draft = copyPlaceAndTime(sampleDraft(blank, { step: 'review' }, TODAY), balham)

    expect(draft).toMatchObject({
      eventType: 'offline',
      venueName: 'Balham Library',
      repeats: 'weekly',
      firstDate: '2026-11-18',
      startTime: '19:30',
      endTime: '20:45',
      timeZone: 'Europe/London',
    })
    expect(draft.address).toMatchObject({ latitude: 51.4454169, longitude: -0.1521182 })
  })

  it('is a duplicate of the class it copied, where the sample alone is not', () => {
    const sample = sampleDraft(blank, { step: 'review' }, TODAY)
    const copied = copyPlaceAndTime(sample, balham)

    // Same door, but the sample meets on Thursdays and the library's class on Wednesdays.
    expect(possibleDuplicates(sample.address, draftPreviewSchedule(sample), [balham])).toEqual([])
    expect(possibleDuplicates(copied.address, draftPreviewSchedule(copied), [balham])).toEqual([
      balham,
    ])
  })
})
