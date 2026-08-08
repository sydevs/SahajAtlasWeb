import createDOMPurify from 'dompurify'

/**
 * The only tags CMS-authored event prose may render as.
 *
 * Everything the Lexical serializer can emit for a description, and nothing
 * else — no `div`, no `img`, no `table`, no form controls. Stripping a tag
 * keeps its text (DOMPurify's default), so an author who reaches past this list
 * loses the markup, never the words.
 */
const ALLOWED_TAGS = ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'del', 'br', 'h3']

const DOMPurify = createDOMPurify(window)

// ADD_ATTR keeps host-authored `target` links working; force the safe rel on
// them so a `target="_blank"` in prose can never reverse-tabnab via
// window.opener (belt-and-braces — modern browsers imply noopener).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

/**
 * Sanitize one event description for `dangerouslySetInnerHTML`.
 *
 * The config is deliberately an allowlist and NOTHING else. It used to also
 * pass `USE_PROFILES: { html: true }`, which does not intersect with
 * `ALLOWED_TAGS` — it **replaces** it, so the effective policy was the full
 * HTML profile (~117 tags, ~113 attributes) and the twelve tags below were
 * decorative. That is not script execution, since the profile is XSS-safe, but
 * this markup renders inside a HOST page: `style` alone buys an authored
 * `position:fixed;inset:0` overlay on top of someone else's site, `img src` a
 * request to any origin, and `form`/`input` a credential prompt wearing the
 * host's chrome. Re-verified against dompurify 3.4.13 — the precedence has not
 * changed between 3.2.x and 3.4.x, so the option's removal is the fix.
 *
 * `ADD_ATTR: ['target']` stays: it adds to `ALLOWED_ATTR` rather than replacing
 * it, `target` is not a URI attribute (a `javascript:` href is still rejected),
 * and the string-array form is unrelated to the predicate form that
 * GHSA-cjmm-f4jc-qw8r reported — fixed in 3.3.2 regardless.
 */
export function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
    ADD_ATTR: ['target'],
  })
}
