import { createInstance } from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import { scheduleXWords } from './schedule-x-words'

import { i18nSharedOptions } from '@/config/i18n-options'
import snapshot from '@/config/translations.en.json'

const i18n = createInstance()
let words: ReturnType<typeof scheduleXWords>['sydevs']

beforeAll(async () => {
  await i18n.init({ ...i18nSharedOptions, lng: 'en', resources: { en: { translation: snapshot } } })
  words = scheduleXWords(i18n.t).sydevs
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
})
