import createDOMPurify from 'dompurify'

/**
 * The only tags CMS-authored event prose may render as.
 *
 * This list has to stay a superset of what `lexicalToHtml` (`@/lib/shape`) can
 * emit, or the sanitizer silently deletes markup the CMS legitimately produced
 * — and since stripping a tag keeps its text, the loss is invisible: no error,
 * no blank space, just prose that quietly stopped being a heading.
 * `sanitize.test.ts` pins the two files against each other for exactly that
 * reason. All six heading levels are here because the serializer passes any
 * `h1`–`h6` through (`lexical.ts`, the `heading` case); `b`/`i` because the
 * serializer does not emit them today but the CMS's own editor offers them.
 */
const ALLOWED_TAGS = [
  'p',
  'b',
  'i',
  'em',
  'strong',
  'a',
  'ul',
  'ol',
  'li',
  'del',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]

const DOMPurify = createDOMPurify(window)

// `target` survives the allowlist (ADD_ATTR below), so this decides what a
// host-authored one is allowed to mean. Only `_blank` is kept, and it is forced
// to carry the safe rel so prose can never reverse-tabnab through
// window.opener. Every other value — `_top` and `_parent` especially, which
// aim at the frame containing us and which `noopener` does nothing about — is
// dropped, leaving the browser's default `_self`. That is what a plain link
// already does, so nothing legitimate is lost.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'A' || !node.hasAttribute('target')) return

  if (node.getAttribute('target')?.toLowerCase() === '_blank') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  } else {
    node.removeAttribute('target')
  }
})

/**
 * Sanitize one event description for `dangerouslySetInnerHTML`.
 *
 * The config is an allowlist and nothing else. It used to also pass
 * `USE_PROFILES: { html: true }`, which does not intersect with `ALLOWED_TAGS`
 * — it **replaces** it, so the effective policy was the full HTML profile (119
 * tags, 118 attributes, measured against 3.4.13) and the list above was
 * decorative. That is not script execution, since the profile is XSS-safe, but
 * this markup renders inside a HOST page: `style` alone buys an authored
 * `position:fixed;inset:0` overlay on top of someone else's site, `img src` a
 * request to any origin, and `form`/`input` a credential prompt wearing the
 * host's chrome. Re-verified against dompurify 3.4.13 — the precedence has not
 * changed between 3.2.x and 3.4.x, so the option's removal is the fix.
 *
 * `ALLOW_DATA_ATTR` / `ALLOW_ARIA_ATTR` default to **true** and are independent
 * of `ALLOWED_ATTR`, so they have to be turned off by name: without them the
 * "allowlist" still passes every `data-*` and `aria-*` through. Both are live
 * hooks here rather than inert decoration — the drawer this prose renders in is
 * vaul, which is driven by `data-vaul-*`, and `aria-live="assertive"` on a host
 * page hijacks announcements the host owns.
 *
 * `ADD_ATTR: ['target']` stays: it adds to `ALLOWED_ATTR` rather than replacing
 * it, `target` is not a URI attribute (a `javascript:` href is still rejected),
 * and the string-array form is unrelated to the predicate form that
 * GHSA-cjmm-f4jc-qw8r reported — fixed in 3.3.2 regardless. It applies to all
 * allowed tags, not just anchors; the hook above is what makes it an anchor
 * concern, so keep its `tagName` guard.
 */
export function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })
}
