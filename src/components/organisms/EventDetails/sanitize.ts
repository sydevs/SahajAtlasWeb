import createDOMPurify from 'dompurify'

/**
 * These are the only tags CMS-authored event prose may render as.
 *
 * This list must stay a superset of what `lexicalToHtml` (`@/lib/shape`) can
 * emit. Otherwise the sanitizer silently deletes markup the CMS legitimately
 * produced. Stripping a tag keeps its text, so the loss is invisible: no
 * error, no blank space, just prose that quietly stopped being a heading.
 * `sanitize.test.ts` pins the two files against each other for exactly that
 * reason. All six heading levels appear here because the serializer passes
 * any `h1` through `h6` through (`lexical.ts`, the `heading` case). `b` and
 * `i` appear here because the serializer does not emit them today, but the
 * CMS's own editor offers them.
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

// `target` survives the allowlist (ADD_ATTR below), so this hook decides what
// a host-authored one is allowed to mean. Only `_blank` is kept, and it is
// forced to carry the safe rel, so prose can never reverse-tabnab through
// `window.opener`. Every other value is dropped, leaving the browser's
// default `_self`. This includes `_top` and `_parent` especially, which aim
// at the frame containing us — a target `noopener` does nothing about. A
// plain link already behaves this way, so nothing legitimate is lost.
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
 * The config is an allowlist, and nothing else. It once also passed
 * `USE_PROFILES: { html: true }`. That option does not narrow `ALLOWED_TAGS`
 * — it **replaces** it. So the effective policy became the full HTML profile
 * (119 tags, 118 attributes, measured against 3.4.13), and the list above did
 * nothing. That gap does not allow script execution, since the profile itself
 * is XSS-safe. But this markup renders inside a HOST page. `style` alone lets
 * an author add a `position:fixed;inset:0` overlay on top of someone else's
 * site. `img src` lets an author request any origin. `form` and `input` let
 * an author build a credential prompt wearing the host's chrome. This was
 * re-verified against dompurify 3.4.13. The precedence has not changed
 * between 3.2.x and 3.4.x, so removing the option is the fix.
 *
 * `ALLOW_DATA_ATTR` and `ALLOW_ARIA_ATTR` default to **true**. They are
 * independent of `ALLOWED_ATTR`, so each must be turned off by name. Without
 * that, the "allowlist" still passes every `data-*` and `aria-*` attribute
 * through. Both are live risks here, not inert decoration. The drawer this
 * prose renders in is vaul, which `data-vaul-*` attributes drive. And
 * `aria-live="assertive"` on a host page can hijack announcements the host
 * owns.
 *
 * `ADD_ATTR: ['target']` stays in place. It adds to `ALLOWED_ATTR` instead of
 * replacing it. `target` is not a URI attribute, so a `javascript:` href is
 * still rejected. The string-array form is also unrelated to the predicate
 * form that GHSA-cjmm-f4jc-qw8r reported, which was fixed in 3.3.2 regardless.
 * This option applies to all allowed tags, not just anchors. The hook above
 * is what makes it an anchor-only concern in practice, so keep its `tagName`
 * guard.
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
