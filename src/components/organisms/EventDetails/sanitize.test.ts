// @vitest-environment jsdom
//
// This is the third spec in the unit lane that boots a DOM (see `docs/testing.md`).
// It is also the one case where that choice is not a judgment call. DOMPurify
// sanitizes by parsing a real document and walking it. So there is no DOM-free
// half to extract. The DOM behavior IS the thing under test. This spec exercises
// it through the module's own configured instance, so the hook and the config
// are covered exactly as they ship.
//
// This spec pins down that the allowlist is LOAD-BEARING. It once was not.
// `USE_PROFILES: { html: true }` replaced `ALLOWED_TAGS` and `ALLOWED_ATTR`
// instead of narrowing them. So the list was only documentation, and the real
// policy was the full HTML profile. Every gate stayed green the whole time,
// because nothing asserted on the output. This is why the assertions here
// check strings a reader can verify by eye.
//
// The round trip against `lexicalToHtml` is the other half of this spec. It is
// the check that would have caught this file's own first draft. Tightening the
// allowlist is safe only while it stays a superset of what the serializer
// emits. The first draft dropped five heading levels silently, because a
// stripped tag keeps its text and looks like plain prose.
import { describe, expect, it } from 'vitest'

import { sanitizeDescription } from './sanitize'

import { lexicalToHtml } from '@/lib/shape'

/** Every tag the allowlist admits, each with text so a strip is visible. */
const ALLOWED_CASES: [string, string][] = [
  ['p', '<p>para</p>'],
  ['b', '<b>bold</b>'],
  ['i', '<i>ital</i>'],
  ['em', '<em>emph</em>'],
  ['strong', '<strong>strong</strong>'],
  ['ul + li', '<ul><li>one</li></ul>'],
  ['ol + li', '<ol><li>one</li></ol>'],
  ['del', '<del>struck</del>'],
  ['br', '<br>'],
  ['h1', '<h1>one</h1>'],
  ['h2', '<h2>two</h2>'],
  ['h3', '<h3>three</h3>'],
  ['h4', '<h4>four</h4>'],
  ['h5', '<h5>five</h5>'],
  ['h6', '<h6>six</h6>'],
]

/** A Lexical root wrapping one node, in the shape `lexicalToHtml` parses. */
const lexicalRoot = (child: unknown) => ({ root: { type: 'root', children: [child] } })

describe('sanitizeDescription', () => {
  describe('keeps every allowed tag', () => {
    it.each(ALLOWED_CASES)('%s', (_name, html) => {
      expect(sanitizeDescription(html)).toBe(html)
    })

    it('a, with href', () => {
      expect(sanitizeDescription('<a href="https://example.com">link</a>')).toBe(
        '<a href="https://example.com">link</a>',
      )
    })
  })

  // This test keeps the two files from drifting apart. `lexicalToHtml` passes
  // any h1 through h6 heading through, so an allowlist carrying only `h3`
  // would silently delete five of them.
  describe('survives everything lexicalToHtml can emit', () => {
    it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])('heading %s round-trips', (tag) => {
      const html = lexicalToHtml(
        lexicalRoot({ type: 'heading', tag, children: [{ type: 'text', text: 'Heading' }] }),
      )

      expect(html).toBe(`<${tag}>Heading</${tag}>`)
      expect(sanitizeDescription(html)).toBe(html)
    })

    it.each([
      ['paragraph', { type: 'paragraph', children: [{ type: 'text', text: 'Body' }] }],
      [
        'list',
        {
          type: 'list',
          tag: 'ul',
          children: [{ type: 'listitem', children: [{ type: 'text', text: 'Item' }] }],
        },
      ],
      [
        'link',
        {
          type: 'link',
          fields: { url: 'https://example.com' },
          children: [{ type: 'text', text: 'Link' }],
        },
      ],
    ])('%s round-trips', (_name, node) => {
      const html = lexicalToHtml(lexicalRoot(node))

      expect(html).not.toBe('')
      expect(sanitizeDescription(html)).toBe(html)
    })
  })

  describe('strips everything outside it', () => {
    // This is the clickjacking surface the old profile left open: an authored
    // overlay could cover the HOST page. Both the tag and the style attribute
    // must go.
    it('drops a positioned div, keeping only its text', () => {
      const out = sanitizeDescription(
        '<div style="position:fixed;inset:0;z-index:9999">overlay</div>',
      )

      expect(out).toBe('overlay')
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

    it('drops a table, keeping only its text', () => {
      expect(sanitizeDescription('<table><tr><td>cell</td></tr></table>')).toBe('cell')
    })

    it('drops attributes that are not href or target', () => {
      expect(sanitizeDescription('<p class="leak" id="x" style="color:red">text</p>')).toBe(
        '<p>text</p>',
      )
    })

    // ALLOW_DATA_ATTR and ALLOW_ARIA_ATTR default to true. They are independent
    // of ALLOWED_ATTR, so these attributes pass straight through unless turned
    // off by name. `data-vaul-*` drives the drawer that renders this prose.
    // `aria-live` on a host page hijacks announcements the host owns.
    it('drops data-* attributes', () => {
      expect(sanitizeDescription('<p data-vaul-no-drag="true" data-state="open">t</p>')).toBe(
        '<p>t</p>',
      )
    })

    it('drops aria-* attributes', () => {
      expect(sanitizeDescription('<p aria-live="assertive" aria-hidden="true">t</p>')).toBe(
        '<p>t</p>',
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
    it('keeps _blank and hardens rel (the afterSanitizeAttributes hook)', () => {
      expect(sanitizeDescription('<a href="https://example.com" target="_blank">link</a>')).toBe(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>',
      )
    })

    it('overrides an author-supplied rel', () => {
      const out = sanitizeDescription(
        '<a href="https://example.com" target="_blank" rel="opener">link</a>',
      )

      expect(out).toContain('rel="noopener noreferrer"')
      expect(out).not.toContain('rel="opener"')
    })

    // `noopener` says nothing about WHERE a link lands, so the frame-targeting
    // keywords are dropped rather than hardened — the default `_self` is safe.
    it.each(['_top', '_parent', 'hostframe'])('drops target=%s', (target) => {
      const out = sanitizeDescription(`<a href="https://example.com" target="${target}">x</a>`)

      expect(out).toBe('<a href="https://example.com">x</a>')
    })

    it('leaves rel off a link with no target', () => {
      expect(sanitizeDescription('<a href="https://example.com">link</a>')).not.toContain('rel=')
    })

    it('still rejects a javascript: href — ADD_ATTR does not skip URI validation', () => {
      expect(sanitizeDescription('<a href="javascript:alert(1)" target="_blank">x</a>')).toBe(
        '<a target="_blank" rel="noopener noreferrer">x</a>',
      )
    })
  })
})
