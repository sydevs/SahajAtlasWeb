/**
 * Host-declared opt-outs for the widget's two third-party data flows (issue #95).
 *
 * The widget runs inside somebody else's page, and under GDPR that somebody — not us —
 * is the controller answering for what their visitors' browsers are made to do. Both
 * flows are off-by-nothing useful to them if they cannot switch them off, so each gets
 * an attribute on `<sahaj-atlas>`:
 *
 *  - `analytics="false"` — never load Fathom. It injects OUR tracker into THEIR page.
 *  - `geolocation="false"` — never call the IP-geolocation service. The visitor's IP is
 *    personal data, and a host whose privacy notice can't cover a third-party lookup
 *    needs a way to decline it rather than to decline the widget.
 *
 * Both default to enabled, so an existing embed behaves exactly as it did.
 *
 * A mutable in-memory singleton set once from the element's props, mirroring
 * `config/api/auth.ts` and `config/preview.ts`: page-global boot state, read directly
 * where it's needed rather than threaded through context. Nothing here is persisted,
 * and nothing re-renders on a change — a host flipping the attribute mid-session takes
 * effect on the next page load, which is when a consent decision is made anyway.
 */
export type PrivacySettings = {
  /** Load Fathom and send pageviews (also requires VITE_FATHOM_ID + a real domain). */
  analytics: boolean
  /** Allow the passive IP-location lookup behind the nearby suggestion + online times. */
  ipLookup: boolean
}

const privacy: PrivacySettings = {
  analytics: true,
  ipLookup: true,
}

/**
 * Read a boolean custom-element attribute. r2wc hands every attribute through as a
 * string, so `false` and `0` are the two spellings an integrator writes to turn
 * something off — the same convention `map="false"` already uses. Anything else
 * (absent, empty, `true`) leaves the feature on: an attribute nobody set must never
 * silently disable a flow the host is relying on.
 */
export const attributeEnabled = (value?: string): boolean => value !== 'false' && value !== '0'

export default privacy
