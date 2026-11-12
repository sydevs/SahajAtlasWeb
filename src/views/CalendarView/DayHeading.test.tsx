import type { TFunction } from 'i18next'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DayHeading, dayHeadingParts } from './DayHeading'

import snapshot from '@/config/translations.en.json'

// The snapshot's English, with `%{var}` filled and `count` picking `_one` / `_other`.
const { t } = vi.hoisted(() => ({
  t: ((key: string, options: Record<string, unknown> = {}) => {
    const plural =
      typeof options.count === 'number' ? `${key}_${options.count === 1 ? 'one' : 'other'}` : key
    const value = plural
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], snapshot)

    return String(value).replace(/%\{(\w+)\}/g, (_, name: string) => String(options[name]))
  }) as unknown as TFunction,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))

const today = '2026-11-12'

describe('dayHeadingParts', () => {
  it('leads with the compact date, with Today and the count as a quieter note', () => {
    expect(dayHeadingParts(today, { today, locale: 'en-US', t, count: 4 })).toEqual({
      heading: 'Thursday, Nov 12',
      note: 'Today · 4 classes',
    })
  })

  it('writes the date the visitor’s way', () => {
    expect(dayHeadingParts(today, { today, locale: 'en-GB', t }).heading).toBe('Thursday 12 Nov')
  })

  it('says Tomorrow for the next day, and one class in the singular', () => {
    expect(dayHeadingParts('2026-11-13', { today, locale: 'en-GB', t, count: 1 })).toEqual({
      heading: 'Friday 13 Nov',
      note: 'Tomorrow · 1 class',
    })
  })

  it('leaves the note empty for a later day with nothing to count', () => {
    expect(dayHeadingParts('2026-11-16', { today, locale: 'en-GB', t, count: 0 }).note).toBe('')
  })
})

describe('DayHeading', () => {
  afterEach(() => vi.useRealTimers())

  it('renders the date as the heading and Today beside it, quieter', () => {
    vi.useFakeTimers({ now: new Date('2026-11-12T10:00:00') })

    const html = renderToStaticMarkup(createElement(DayHeading, { date: today }))

    expect(html).toMatch(
      /^<h3[^>]*>Thursday,? (Nov 12|12 Nov)<span class="[^"]*text-gray-11[^"]*">Today<\/span><\/h3>$/,
    )
  })
})
