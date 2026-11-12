import { safePath } from './path'

/**
 * The only schemes allowed to reach an `<a href>`. Case-INSENSITIVE, because no casing of
 * these four is a dangerous scheme (RFC 3986 §3.1 and the WHATWG parser both treat schemes
 * case-insensitively anyway), and because a case-sensitive test would refuse a `HTTPS://…`
 * that an upstream guard already passed — `SafeUrlSchema` (`types/event.ts`) and
 * `validateWebUrl` (`lib/url.ts`) are both `/^https?:/i` — silently degrading a valid link
 * to text.
 *
 * ⚠ **`webcal:` reaches neither of those guards.** It is an address WE build, by swapping
 * the scheme on a `calendarFeedUrl` that `SafeUrlSchema` already parsed as `http(s)`
 * (`lib/ics.ts`), so nothing upstream sees the value this list admits. Read the paragraph
 * above as the argument for case-insensitivity, not as a second gate behind this one.
 *
 * Module-private on purpose. It used to live inside the `Link` atom, where the app's two
 * other anchors could not reach it. This file exists so there is exactly one copy. Ask one
 * of the two predicates below, instead of re-deriving the regex.
 */
const ALLOWED_SCHEME = /^(?:https?|mailto|tel|webcal):/i

/**
 * True when `href` names a scheme rather than a route. This is a RENDERING question, not a
 * safety one: it is what tells the `Link` atom to emit a plain `<a>` instead of routing the
 * string through react-router. Safety is `isSafeHref` — never substitute this for it, since
 * on its own it says nothing about a site-relative path.
 *
 * A protocol handler (`webcal:`) is one of these: the browser hands it to the operating
 * system, so react-router must never see it.
 */
export const hasAllowedScheme = (href: unknown): boolean =>
  typeof href === 'string' && ALLOWED_SCHEME.test(href)

/**
 * **The gate every href the app puts on a JSX `<a>` passes through**: true only for a string
 * that is either a safe site-relative route or one of the four allowed schemes.
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
 * DOMPurify where it is rendered rather than gated here. This is a different sink, with a
 * different mechanism. Do not read this as covering it.
 *
 * "Same-origin route" is **`safePath`**, never a fresh leading-slash check. `safePath` is
 * the repo's single definition and already rejects `//evil.com`, `/\evil.com` and the
 * TAB/LF/CR variants — the last because the WHATWG URL parser strips those characters
 * before parsing, so all three are read as `//evil.com`. Reimplementing the test here is how
 * a second, weaker definition gets born. `path.test.ts` pins each case against this one.
 *
 * Two things it deliberately does NOT promise:
 *
 * - **It judges the scheme, not the payload.** `tel:${event.contactPhone}` passes because it
 *   starts with `tel:`, whatever the CMS put after the colon. That is sound — no `tel:` or
 *   `mailto:` body executes or crosses an origin — but it means this gate is not a reason to
 *   retire an upstream check like `SafeUrlSchema` on the value being concatenated.
 * - **Safe is not the same as routable.** A site-relative `/gb` passes at all three anchors,
 *   but only `Link` has react-router behind it. On a `Button`/`ActionCircle` it renders a
 *   plain `<a>` that navigates the host document away. Read this as a shared safety floor,
 *   never as a shared capability — see the note in `Fallbacks.tsx`'s `OnwardLink`.
 *
 * Takes a non-string safely and never throws: these anchors render inside the error
 * fallback, where a throw would blank the widget on somebody else's page.
 */
export const isSafeHref = (href: unknown): boolean =>
  typeof href === 'string' && (safePath(href) !== undefined || hasAllowedScheme(href))
