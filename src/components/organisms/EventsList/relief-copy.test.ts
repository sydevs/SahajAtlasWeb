import type { TFunction } from 'i18next'

import { describe, expect, it } from 'vitest'

import { reliefCopy } from './relief-copy'

// The key and its options, so each case can see which copy it picked and with what count.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction

const days = { key: 'days' as const, label: 'Tue', count: 1 }

describe('reliefCopy', () => {
  it('names what the hidden classes differ in, under classes that remain', () => {
    expect(
      reliefCopy(t, { here: 1, hiddenHere: 1, hiddenNearby: 0, place: 'Prague', best: days }),
    ).toEqual({
      sentence: 'search.filtered.more_days {"count":1}',
      action: 'search.filtered.show_days',
    })
  })

  it('counts what the one step gives back, not every hidden class', () => {
    const { sentence } = reliefCopy(t, {
      here: 1,
      hiddenHere: 3,
      hiddenNearby: 0,
      place: 'Prague',
      best: { ...days, count: 2 },
    })

    expect(sentence).toBe('search.filtered.more_days {"count":2}')
  })

  it('falls back to the filters, and to Remove, for a filter with no plain wording', () => {
    expect(
      reliefCopy(t, {
        here: 1,
        hiddenHere: 1,
        hiddenNearby: 0,
        place: 'Prague',
        best: { key: 'cadence', label: 'Weekly', count: 1 },
      }),
    ).toEqual({
      sentence: 'search.filtered.more_other {"count":1}',
      action: 'search.filtered.remove_short {"label":"Weekly"}',
    })
  })

  // The regression: with no class left, `after && label` was `false`, which `??` keeps, and the
  // button rendered empty.
  it('offers Remove when the filters emptied the place', () => {
    expect(
      reliefCopy(t, { here: 0, hiddenHere: 2, hiddenNearby: 0, place: 'Prague', best: days }),
    ).toEqual({
      sentence: 'search.filtered.hidden_here {"count":2,"place":"Prague"}',
      action: 'search.filtered.remove_short {"label":"Tue"}',
    })
  })

  it('speaks of nearby classes when the place lost none', () => {
    expect(
      reliefCopy(t, { here: 2, hiddenHere: 0, hiddenNearby: 3, place: 'Prague', best: days })
        .sentence,
    ).toBe('search.filtered.hidden_nearby {"count":3}')
  })

  it('clears every filter when no single one gives anything back', () => {
    expect(reliefCopy(t, { here: 1, hiddenHere: 1, hiddenNearby: 0, place: 'Prague' })).toEqual({
      sentence: 'search.filtered.more_other {"count":1}',
      action: 'filters.chrome.clear',
    })
  })
})
