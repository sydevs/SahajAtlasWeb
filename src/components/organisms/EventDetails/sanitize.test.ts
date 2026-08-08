// @vitest-environment jsdom
//
// The third spec in the unit lane that boots a DOM (see `.claude/rules/tests.md`), and the
// one case where that is not a judgement call: DOMPurify sanitizes by parsing into a real
// document and walking it. There is no DOM-free half to extract — the thing under test IS
// the DOM behaviour, and it is exercised through the module's own configured instance so
// the hook and the config are covered as they actually ship.
//
// What it pins is that the allowlist is LOAD-BEARING. It was not: `USE_PROFILES: { html:
// true }` replaced `ALLOWED_TAGS`/`ALLOWED_ATTR` rather than intersecting with them, so
// the twelve tags below were documentation and the real policy was the full HTML profile.
// Every gate stayed green the whole time, because nothing asserted on the output — which
// is exactly why the assertions here are on strings a reader can check by eye.
import { describe, expect, it } from 'vitest'

import { sanitizeDescription } from './sanitize'

/** Every tag the allowlist admits, each with text so a strip is visible. */
const ALLOWED_CASES: [string, string][] = [
  ['p', '<p>para</p>'],
  ['b', '<b>bold</b>'],
  ['i', '<i>ital</i>'],
  ['em', '<em>emph</em>'],
  ['strong', '<strong>strong</strong>'],
  ['ul', '<ul><li>one</li></ul>'],
  ['ol', '<ol><li>one</li></ol>'],
  ['del', '<del>struck</del>'],
  ['br', '<br>'],
  ['h3', '<h3>heading</h3>'],
]

describe('sanitizeDescription', () => {
  describe('keeps the twelve allowed tags', () => {
    it.each(ALLOWED_CASES)('%s', (_tag, html) => {
      expect(sanitizeDescription(html)).toBe(html)
    })

    it('a, with href', () => {
      expect(sanitizeDescription('<a href="https://example.com">link</a>')).toBe(
        '<a href="https://example.com">link</a>',
      )
    })
  })

  describe('strips everything outside it', () => {
    // The clickjacking surface the profile was leaving open: an authored overlay
    // covering the HOST page. Both the tag and the style attribute must go.
    it('drops a positioned div, keeping only its text', () => {
      const out = sanitizeDescription(
        '<div style="position:fixed;inset:0;z-index:9999">overlay</div>',
      )

      expect(out).toBe('overlay')
      expect(out).not.toContain('style')
      expect(out).not.toContain('position:fixed')
    })

    it('drops an image beacon entirely', () => {
      expect(sanitizeDescription('<img src="https://evil.example/beacon.gif">')).toBe('')
    })

    it('drops a form and its inputs', () => {
      const out = sanitizeDescription(
        '<form action="https://evil.example"><input name="pw" type="password"></form>',
      )

      expect(out).not.toContain('<form')
      expect(out).not.toContain('<input')
      expect(out).not.toContain('evil.example')
    })

    it('drops attributes that are not href or target', () => {
      expect(sanitizeDescription('<p class="leak" id="x" style="color:red">text</p>')).toBe(
        '<p>text</p>',
      )
    })

    it('drops a script outright', () => {
      expect(sanitizeDescription('<script>alert(1)</script>')).toBe('')
    })

    it('drops an inline event handler on an allowed tag', () => {
      expect(sanitizeDescription('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>')
    })
  })

  describe('target links', () => {
    it('keeps target and hardens rel (the afterSanitizeAttributes hook)', () => {
      const out = sanitizeDescription('<a href="https://example.com" target="_blank">link</a>')

      expect(out).toContain('target="_blank"')
      expect(out).toContain('rel="noopener noreferrer"')
      expect(out).toContain('href="https://example.com"')
    })

    it('leaves rel off a link with no target', () => {
      expect(sanitizeDescription('<a href="https://example.com">link</a>')).not.toContain('rel=')
    })

    it('still rejects a javascript: href — ADD_ATTR does not skip URI validation', () => {
      const out = sanitizeDescription('<a href="javascript:alert(1)" target="_blank">x</a>')

      expect(out).not.toContain('javascript:')
      expect(out).not.toContain('href')
    })
  })
})
