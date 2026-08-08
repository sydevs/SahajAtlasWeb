import { safePath } from './path'

/**
 * The only schemes allowed to reach an `<a href>`. Case-INSENSITIVE, to agree with the two
 * upstream URL guards that feed these anchors — `SafeUrlSchema` (`types/event.ts`) and
 * `validateWebUrl` (`lib/url.ts`) both use `/^https?:/i`. A case-sensitive test would refuse
 * a `HTTPS://…` those two already passed, silently degrading a valid link to text; and it
 * buys nothing, since no casing of `https`/`mailto`/`tel` is a dangerous scheme (RFC 3986
 * §3.1 and the WHATWG parser both treat schemes case-insensitively anyway).
 *
 * Module-private on purpose. It used to live inside the `Link` atom, where the app's two
 * OTHER anchors could not reach it; this file exists so there is exactly one copy. Ask one
 * of the two predicates below rather than re-deriving the regex.
 */
const ALLOWED_SCHEME = /^(?:https?|mailto|tel):/i

/**
 * True when `href` names a scheme rather than a route. This is a RENDERING question, not a
 * safety one: it is what tells the `Link` atom to emit a plain `<a>` instead of routing the
 * string through react-router. Safety is `isSafeHref` — never substitute this for it, since
 * on its own it says nothing about a site-relative path.
 */
export const hasAllowedScheme = (href: unknown): boolean =>
  typeof href === 'string' && ALLOWED_SCHEME.test(href)

/**
 * **The gate every href the app puts on a JSX `<a>` passes through**: true only for a string
 * that is either a safe site-relative route or one of the three allowed schemes.
 *
 * It is one predicate in one place because the app renders three such anchors — the `Link`
 * atom, the `Button` atom's href form, and `ActionRow`'s `ActionCircle` — and safety used to
 * be asserted once per CALLER instead of once at the sink. Every href reaching them was safe
 * by provenance, which is not a property the next component or the next caller inherits.
 * That is also why the recurrences look accidental rather than careless: the `Link` atom's
 * own guard was lost and restored twice, and #100 found `//evil.com` walking through an
 * `href.startsWith('/')` test that read as correct. `href.test.ts` pins the three-anchor
 * inventory so a fourth cannot be added without meeting this function.
 *
 * It is **not** the app's only path from a URL to an anchor: `lexicalToHtml` (`lexical.ts`)
 * serializes CMS rich text to an HTML *string* containing `<a href>`, which is sanitized by
 * DOMPurify where it is rendered rather than gated here. Different sink, different
 * mechanism — don't read this as covering it.
 *
 * "Same-origin route" is **`safePath`**, never a fresh leading-slash check. `safePath` is
 * the repo's single definition and already rejects `//evil.com`, `/\evil.com` and the
 * TAB/LF/CR variants — the last because the WHATWG URL parser strips those characters
 * before parsing, so all three are read as `//evil.com`. Reimplementing the test here is how
 * a second, weaker definition gets born; `path.test.ts` pins each case against this one.
 *
 * Takes a non-string safely and never throws: these anchors render inside the error
 * fallback, where a throw would blank the widget on somebody else's page.
 */
export const isSafeHref = (href: unknown): boolean =>
  typeof href === 'string' && (safePath(href) !== undefined || hasAllowedScheme(href))
