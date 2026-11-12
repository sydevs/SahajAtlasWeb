import { describe, expect, it } from 'vitest'

import { SAMPLE_LISTED_CLASS, SAMPLE_PLACE, SAMPLE_SIGNUP_LINK, sampleDraft } from './listing'

import {
  copyPlaceAndTime,
  draftPreviewSchedule,
  emptyDraft,
  firstInvalidStep,
  possibleDuplicates,
  stepErrors,
} from '@/lib/proposal'

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

describe('the sample beside the class it might duplicate', () => {
  it('is a duplicate of the class it copied, where the sample alone is not', () => {
    const sample = sampleDraft(blank, { step: 'review' }, TODAY)
    const copied = copyPlaceAndTime(sample, SAMPLE_LISTED_CLASS)
    const listed = [SAMPLE_LISTED_CLASS]

    // Same door, but the sample meets on Thursdays and the library's class on Wednesdays.
    expect(possibleDuplicates(sample.address, draftPreviewSchedule(sample), listed)).toEqual([])
    expect(possibleDuplicates(copied.address, draftPreviewSchedule(copied), listed)).toEqual(listed)
  })

  it('names no day or hour, so its title still reads true over a copied class’s time', () => {
    const { title } = sampleDraft(blank, { step: 'review' }, TODAY)

    expect(title).not.toMatch(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)
    expect(title).not.toMatch(/morning|afternoon|evening|night/i)
  })
})
