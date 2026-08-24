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

  // ⚠ The whole point of parsing: the WHATWG parser strips leading/embedded ASCII whitespace
  // BEFORE parsing, so a value with a leading space is a valid `https:` URL to `new URL` and is
  // NOT one to `isSafeHref`, whose scheme test is `^`-anchored. Returning the raw string
  // therefore passed this gate and produced the dead card the gate exists to prevent — for the
  // likeliest `.env` typo there is. Returning the PARSED url is what closes it.
  it.each([
    ' https://example.org/classes',
    '\thttps://example.org/classes',
    'https://exa\nmple.org/',
  ])('normalises rather than passing through the raw string: %j', (value) => {
    const result = fallbackUrl(value)

    expect(result).not.toContain(' ')
    expect(result).not.toContain('\t')
    expect(result).not.toContain('\n')
    expect(result.startsWith('https://')).toBe(true)
  })
})
