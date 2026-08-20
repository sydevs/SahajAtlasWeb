import { describe, expect, it } from 'vitest'

import { DEFAULT_FALLBACK_URL, fallbackUrl } from './fallback-url'

describe('fallbackUrl', () => {
  it('uses a configured https URL', () => {
    expect(fallbackUrl('https://example.org/classes')).toBe('https://example.org/classes')
  })

  it.each([undefined, '', 'not a url', 'http://insecure.example', 'javascript:alert(1)'])(
    'falls back to the default for %s',
    (value) => {
      // Validated HERE rather than at the sink, because the sink fails silently and badly: the
      // `Button` atom's href arm refuses an unsafe href by rendering a props-less `<span>`, and
      // on a card whose only content is that control that is a dead, unlabelled box where the
      // way out should be. A typo'd env var would ship a compact embed with no exit.
      expect(fallbackUrl(value)).toBe(DEFAULT_FALLBACK_URL)
    },
  )
})
