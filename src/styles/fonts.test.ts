import { describe, expect, it } from 'vitest'

import { FONT_FAMILY, fontFaceCss } from './fonts'

// This is the one stylesheet of ours that reaches the host document WITHOUT passing
// through the build's scoping pass — it is assembled at runtime, so `assert-css-scoped`
// never sees it (issue #91). `@font-face` carries no selector and so cannot be scoped;
// what has to hold instead is asserted here, so the single exemption from the invariant
// is mechanical rather than a promise in a comment.
describe('fontFaceCss', () => {
  const css = fontFaceCss()

  it('emits nothing but @font-face blocks', () => {
    const blocks = css.split('@font-face').filter((part) => part.trim())

    expect(blocks).toHaveLength(3)
    expect(css.trimStart().startsWith('@font-face')).toBe(true)
    // No selector anywhere: a rule here would land in the host page unscoped.
    expect(css).not.toMatch(/}\s*[^@{}\s][^{}]*\{/)
  })

  it('claims our own family, never plain Raleway', () => {
    // @font-face is document-global and ours is registered last, so declaring the plain
    // name would override the face on a host page that self-hosts Raleway itself.
    expect(FONT_FAMILY).toBe('Atlas Raleway')
    expect(css.match(/font-family:'([^']+)'/g)).toEqual(
      Array(3).fill(`font-family:'${FONT_FAMILY}'`),
    )
  })

  it('subsets each face by unicode-range so only what is rendered is fetched', () => {
    expect(css.match(/unicode-range:/g)).toHaveLength(3)
    // Cyrillic (ru/uk) and latin-ext (cs/hu diacritics) are the two beyond plain latin
    // that public/locales needs.
    expect(css).toContain('U+0400-045F')
    expect(css).toContain('U+1E00-1E9F')
  })

  it('asks for no third-party origin', () => {
    expect(css).not.toContain('fonts.googleapis.com')
    expect(css).not.toContain('fonts.gstatic.com')
  })
})
