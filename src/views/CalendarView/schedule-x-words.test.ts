import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

import { beforeAll, describe, expect, it } from 'vitest'

import { SCHEDULE_X_WORDS, scheduleXWords } from './schedule-x-words'

import { englishT } from '@/test-support/english-t'

let words: ReturnType<typeof scheduleXWords>['sydevs']

beforeAll(async () => {
  words = scheduleXWords(await englishT()).sydevs
})

describe('scheduleXWords', () => {
  it('counts classes, not events, in the plural form the count takes', () => {
    expect(words('+ {{n}} events', { n: 30 })).toBe('+ 30 classes')
    expect(words('+ 1 event', {})).toBe('+ 1 class')
    expect(words('No events', {})).toBe('No classes')
  })

  it('names the button by its own text, then the day', () => {
    expect(
      words('Link to {{n}} more events on {{date}}', { n: 3, date: 'Monday 30 November' }),
    ).toBe('+ 3 classes, Monday 30 November')
    expect(words('Link to 1 more event on {{date}}', { date: 'Monday 30 November' })).toBe(
      '+ 1 class, Monday 30 November',
    )
  })

  it('leaves every other string to Schedule-X', () => {
    expect(words('Today', {})).toBeUndefined()
  })

  // Keyed by Schedule-X's English source strings, so an upgrade that rewords one would quietly
  // bring back its own "events" there.
  it('names only keys the installed Schedule-X still asks for', () => {
    const core = readFileSync(
      createRequire(import.meta.url).resolve('@schedule-x/calendar'),
      'utf8',
    )

    expect(
      Object.keys(SCHEDULE_X_WORDS).filter((key) => !core.includes(`translate('${key}'`)),
    ).toEqual([])
  })
})
