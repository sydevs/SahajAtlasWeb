import { DateTime } from 'luxon'
import { describe, expect, it } from 'vitest'

import {
  addMinutes,
  addQuestions,
  correctionQuestions,
  minutesBetween,
  nextDateOn,
  nextQuestion,
  previousQuestion,
  questionErrors,
  questionProgress,
  reasonFor,
  weekdayOf,
} from './questions'

import { emptyDraft } from '@/lib/proposal'

const draft = emptyDraft('Europe/London', ['en'])
const online = { ...draft, eventType: 'online' as const }

describe('the questions asked', () => {
  it('asks an in-person class for its place, and an online one for its link and city', () => {
    expect(addQuestions(draft)).toEqual([
      'mode',
      'place',
      'often',
      'day',
      'time',
      'language',
      'contact',
      'about',
      'review',
    ])
    expect(addQuestions(online).slice(0, 3)).toEqual(['mode', 'link', 'place'])
  })

  it('asks a correction only what answers what changed', () => {
    expect(correctionQuestions(draft, null)).toEqual(['changed', 'review'])
    expect(correctionQuestions(draft, 'time')).toEqual([
      'changed',
      'often',
      'day',
      'time',
      'review',
    ])
    expect(correctionQuestions(draft, 'contact')).toEqual(['changed', 'contact', 'review'])
    expect(correctionQuestions(draft, 'stopped')).toEqual(['changed', 'stopped', 'review'])
    expect(correctionQuestions(draft, 'other')).toEqual(['changed', 'note', 'review'])
  })

  it('sends an Edit from a correction’s review back into the branch that owns it', () => {
    expect(reasonFor('day')).toBe('time')
    expect(reasonFor('place')).toBe('place')
    expect(reasonFor('note')).toBe('other')
    expect(reasonFor('review')).toBeNull()
  })

  it('walks forward and back, and ends on review', () => {
    const questions = addQuestions(draft)

    expect(nextQuestion(questions, 'mode')).toBe('place')
    expect(nextQuestion(questions, 'review')).toBe('review')
    expect(previousQuestion(questions, 'place')).toBe('mode')
    expect(previousQuestion(questions, 'mode')).toBeNull()
  })

  it('measures progress from the first question to review', () => {
    const questions = addQuestions(draft)

    expect(questionProgress(questions, 'mode')).toBe(0)
    expect(questionProgress(questions, 'review')).toBe(1)
    expect(questionProgress(questions, 'changed')).toBe(0)
  })
})

describe('questionErrors', () => {
  it('holds the place until one is picked', () => {
    expect(questionErrors('place', draft)).toEqual({ address: true })
  })

  it('checks an online link apart from its city', () => {
    expect(questionErrors('link', online)).toEqual({ onlineUrl: true })
    expect(questionErrors('place', { ...online, onlineUrl: 'https://zoom.us/j/1' })).toEqual({
      city: true,
    })
  })

  it('splits the schedule between the day and the time', () => {
    expect(questionErrors('day', draft)).toEqual({ firstDate: true })
    expect(questionErrors('day', { ...draft, firstDate: '2030-11-05' })).toEqual({})
    expect(questionErrors('time', { ...draft, firstDate: '2030-11-05' })).toEqual({
      startTime: true,
    })
  })

  it('lets optional screens pass blank, but not filled wrongly', () => {
    expect(questionErrors('contact', draft)).toEqual({})
    expect(questionErrors('contact', { ...draft, contactEmail: 'nope' })).toEqual({
      contactEmail: true,
    })
    expect(questionErrors('language', draft)).toEqual({})
  })
})

describe('days and times', () => {
  // A Wednesday.
  const now = DateTime.fromISO('2026-10-28T09:00', { zone: 'Europe/London' })

  it('finds the next date on a weekday, today included', () => {
    expect(nextDateOn(2, 'Europe/London', now)).toBe('2026-11-03')
    expect(nextDateOn(3, 'Europe/London', now)).toBe('2026-10-28')
    expect(nextDateOn(7, 'Europe/London', now)).toBe('2026-11-01')
  })

  it('reads a date in the class’s own zone, not the visitor’s', () => {
    // 23:30 Tuesday in London is already Wednesday in Tokyo.
    const late = DateTime.fromISO('2026-10-27T23:30', { zone: 'Europe/London' })

    expect(nextDateOn(3, 'Asia/Tokyo', late)).toBe('2026-10-28')
  })

  it('names the weekday of a date', () => {
    expect(weekdayOf('2026-11-03')).toBe(2)
    expect(weekdayOf('nope')).toBeNull()
  })

  it('adds time across midnight, and measures an overnight session', () => {
    expect(addMinutes('19:30', 60)).toBe('20:30')
    expect(addMinutes('23:30', 90)).toBe('01:00')
    expect(minutesBetween('19:30', '21:00')).toBe(90)
    expect(minutesBetween('23:00', '01:00')).toBe(120)
    expect(minutesBetween('', '01:00')).toBeNull()
  })
})
