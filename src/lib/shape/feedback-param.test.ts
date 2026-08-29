import { describe, expect, it } from 'vitest'

import {
  FEEDBACK_PARAM,
  feedbackAnswer,
  hrefWithoutFeedback,
  searchWithoutFeedback,
} from './feedback-param'

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

describe('searchWithoutFeedback', () => {
  it('removes the parameter', () => {
    expect(searchWithoutFeedback('?feedback=confirmed')).toBe('')
    expect(searchWithoutFeedback('?feedback=confirmed&a=1')).toBe('?a=1')
    expect(searchWithoutFeedback('?a=1&feedback=denied')).toBe('?a=1')
    expect(searchWithoutFeedback('?a=1&feedback=denied&b=2')).toBe('?a=1&b=2')
  })

  /**
   * The reason this is a hand-rolled split rather than `URLSearchParams.delete()`.
   *
   * `.delete()` re-serializes every surviving pair, which loses BOTH the `/` and `,` that
   * `routeToParam` deliberately restores — the part of a shared link that has to stay
   * readable — and a host's own `%20`, rewritten to `+`. Equivalent to a parser; not what the
   * page had, and the second one is somebody else's parameter.
   */
  it('leaves every surviving pair byte-identical, including the route and the host’s own', () => {
    expect(
      searchWithoutFeedback('?atlas=/nl/amsterdam?center=4.9,52.3&feedback=confirmed&keep=a%20b'),
    ).toBe('?atlas=/nl/amsterdam?center=4.9,52.3&keep=a%20b')
  })

  it('leaves a query with no answer in it exactly as it was', () => {
    expect(searchWithoutFeedback('?atlas=/gb/london&keep=a%20b')).toBe(
      '?atlas=/gb/london&keep=a%20b',
    )
    expect(searchWithoutFeedback('')).toBe('')
  })

  // `feedbackAnswer` reads through URLSearchParams, which decodes the NAME as well as the value.
  // The remover has to agree, or a link written that way would be read and never cleaned up.
  it('removes a percent-encoded spelling of the name, as the reader would have read it', () => {
    expect(feedbackAnswer('?%66eedback=denied')).toBe('denied')
    expect(searchWithoutFeedback('?%66eedback=denied&a=1')).toBe('?a=1')
  })

  it('does not remove a parameter that merely contains the name', () => {
    expect(searchWithoutFeedback(`?user_${FEEDBACK_PARAM}=1`)).toBe('?user_feedback=1')
    expect(searchWithoutFeedback('?a=feedback')).toBe('?a=feedback')
  })
})

describe('hrefWithoutFeedback', () => {
  it('rewrites only the query, keeping the path the canonical URL named', () => {
    expect(hrefWithoutFeedback('https://host.example/map/gb/london/1204?feedback=confirmed')).toBe(
      'https://host.example/map/gb/london/1204',
    )
  })

  it('keeps the widget route intact beside it', () => {
    expect(hrefWithoutFeedback('https://host.example/p?atlas=/gb/london&feedback=denied')).toBe(
      'https://host.example/p?atlas=/gb/london',
    )
  })

  it('preserves the fragment, which belongs to the host', () => {
    expect(hrefWithoutFeedback('https://host.example/p?feedback=denied#section')).toBe(
      'https://host.example/p#section',
    )
  })

  // '' means "leave the URL alone" for both reasons a caller has to do nothing.
  it('returns empty when there is nothing to remove or nothing to parse', () => {
    expect(hrefWithoutFeedback('https://host.example/p?atlas=/gb')).toBe('')
    expect(hrefWithoutFeedback('https://host.example/p')).toBe('')
    expect(hrefWithoutFeedback('not a url')).toBe('')
  })
})
