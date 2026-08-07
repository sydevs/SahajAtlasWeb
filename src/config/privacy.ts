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
 * A mutable in-memory singleton, mirroring `config/api/auth.ts` and `config/preview.ts`:
 * page-global settings read directly where they're needed rather than threaded through
 * `WidgetMode` — which would put the analytics flag through four App signatures to reach
 * one expression, and give `useRecoveryOffer` (which renders above the provider, inside
 * `RootBoundary`) the context default instead of the host's answer. Nothing is persisted.
 *
 * `Atlas` rewrites both on every render, so a host that changes an attribute mid-session
 * is honoured from the next render on. One direction can't be taken back: a Fathom script
 * already injected into the page stays there, since Fathom has no unload — switching
 * analytics off stops the pageviews, not the script.
 */
type PrivacySettings = {
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
 * Read a boolean custom-element attribute — the shared reader for all three of them
 * (`map` included), so the spelling can't diverge per attribute. r2wc hands every
 * attribute through as a string, and `false`/`0` are the two an integrator writes to
 * turn something off. Anything else (absent, empty, `true`) leaves the feature on: an
 * attribute nobody set must never silently disable a flow the host relies on.
 */
export const attributeEnabled = (value?: string): boolean => value !== 'false' && value !== '0'

export default privacy
