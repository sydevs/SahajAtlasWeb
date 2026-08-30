import { describe, expect, it, vi } from 'vitest'

import { clearFeedback, feedbackAnswer } from './feedback-param'

describe('feedbackAnswer', () => {
  it('reads the two answers SahajCloud actually sends', () => {
    expect(feedbackAnswer('?feedback=confirmed')).toBe('confirmed')
    expect(feedbackAnswer('?feedback=denied')).toBe('denied')
  })

  it('reads the answer from beside the widget route, not instead of it', () => {
    expect(feedbackAnswer('?atlas=/gb/london/1204&feedback=confirmed')).toBe('confirmed')
  })

  // Resolvable, not merely present — a value with no copy behind it must read as no answer at
  // all, or the banner renders empty.
  it('refuses a value that is not one of the two', () => {
    expect(feedbackAnswer('?feedback=maybe')).toBeUndefined()
    expect(feedbackAnswer('?feedback=')).toBeUndefined()
    expect(feedbackAnswer('?feedback')).toBeUndefined()
    expect(feedbackAnswer('?other=confirmed')).toBeUndefined()
  })

  it('tolerates case and surrounding space from a link that got normalised', () => {
    expect(feedbackAnswer('?feedback=CONFIRMED')).toBe('confirmed')
    expect(feedbackAnswer('?feedback=%20denied%20')).toBe('denied')
  })

  it('never throws on a query string from a page we do not own', () => {
    expect(feedbackAnswer(undefined)).toBeUndefined()
    expect(feedbackAnswer(null)).toBeUndefined()
    expect(feedbackAnswer('')).toBeUndefined()
    expect(feedbackAnswer('?%')).toBeUndefined()
    expect(feedbackAnswer('?a=%E0%A4%A')).toBeUndefined()
  })
})

describe('clearFeedback', () => {
  const fakeWindow = (href: string, state: unknown = { __sy_atlas: { key: 'abc', idx: 2 } }) => {
    const replaceState = vi.fn()

    return {
      replaceState,
      win: { location: { href }, history: { state, replaceState } } as unknown as Window,
    }
  }

  // The wiring, not the helper: `query.ts` is tested on its own, and a pure spec of it would keep
  // passing if this module stopped calling it or reached for the wrong name.
  it('takes the answer out of the address bar and leaves the route alone', () => {
    const { win, replaceState } = fakeWindow(
      'https://host.example/p?atlas=/gb/london&feedback=confirmed&keep=a%20b',
    )

    clearFeedback(win)

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState.mock.calls[0][2]).toBe('https://host.example/p?atlas=/gb/london&keep=a%20b')
  })

  // The atlas history namespaces its entry key and depth under `history.state`. Dropping them
  // would make the drawer's next X climb to the structural parent instead of going back.
  it('passes history.state through untouched', () => {
    const state = { __sy_atlas: { key: 'abc', idx: 2 }, hostOwn: true }
    const { win, replaceState } = fakeWindow('https://host.example/p?feedback=denied', state)

    clearFeedback(win)

    expect(replaceState.mock.calls[0][0]).toBe(state)
  })

  it('writes nothing when the page carries no answer', () => {
    const { win, replaceState } = fakeWindow('https://host.example/p?atlas=/gb/london')

    clearFeedback(win)

    expect(replaceState).not.toHaveBeenCalled()
  })

  it('does not throw where the document refuses replaceState', () => {
    const win = {
      location: { href: 'https://host.example/p?feedback=denied' },
      history: {
        state: null,
        replaceState: () => {
          throw new Error('blocked')
        },
      },
    } as unknown as Window

    expect(() => clearFeedback(win)).not.toThrow()
  })
})
