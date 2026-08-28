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

  it('claims our own family, never a plain typeface name', () => {
    // @font-face is document-global and ours is registered last, so declaring a plain name
    // would override that face on a host page self-hosting the same typeface. Both
    // typefaces here are affected: the Cyrillic face must not ship as `Raleway` either.
    expect(FONT_FAMILY).toBe('Atlas Rethink Sans')
    expect(css.match(/font-family:'([^']+)'/g)).toEqual(
      Array(3).fill(`font-family:'${FONT_FAMILY}'`),
    )
  })

  // Rethink Sans has no Cyrillic subset, so ru/uk would fall back to the visitor's system
  // sans on a straight swap. Raleway's Cyrillic face is kept and claims that range under
  // the same family name, which is the whole reason two typefaces are in play.
  it('still serves Cyrillic, from the retained Raleway face', () => {
    const cyrillic = css.split('@font-face').find((block) => block.includes('U+0400-045F'))

    expect(cyrillic).toBeDefined()
    expect(cyrillic).toContain('raleway')
    // And the latin ranges come from the new typeface, not the old one.
    const latin = css.split('@font-face').find((block) => block.includes('U+2212'))

    expect(latin).toContain('rethink-sans')
  })

  // The two axes differ — Rethink Sans is 400-800, Raleway 100-900. Declaring a range a
  // file does not have makes the browser synthesise the weight instead of interpolating,
  // which is why the weight is per-subset rather than one constant.
  it('declares each face its own weight axis', () => {
    const weights = css.match(/font-weight:([^;]+);/g)

    expect(weights).toEqual([
      'font-weight:400 800;',
      'font-weight:400 800;',
      'font-weight:100 900;',
    ])
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
