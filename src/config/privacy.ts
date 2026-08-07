/**
 * Host-declared opt-outs for the widget's third-party data flows (issues #95, #108).
 *
 * The widget runs inside somebody else's page, and under GDPR that somebody — not us —
 * is the controller answering for what their visitors' browsers are made to do. Every
 * flow is off-by-nothing useful to them if they cannot switch it off, so each gets
 * an attribute on `<sahaj-atlas>`:
 *
 *  - `analytics="false"` — never load Fathom. It injects OUR tracker into THEIR page.
 *  - `geolocation="false"` — never call the IP-geolocation service. The visitor's IP is
 *    personal data, and a host whose privacy notice can't cover a third-party lookup
 *    needs a way to decline it rather than to decline the widget.
 *  - `error-reporting="false"` — never send a crash to Sentry. Its own flag rather than a
 *    reading of `analytics`, because the two answer different questions: measuring an
 *    audience and finding out that a widget is broken are separate purposes with separate
 *    lawful bases, and a host who declines the first has said nothing about the second.
 *    Folding them together would silently over-collect from anyone who wanted only
 *    integrity reporting, and silently under-collect from everyone who set
 *    `analytics="false"` meaning Fathom.
 *
 * All three default to enabled, so an existing embed behaves exactly as it did.
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
  /**
   * Send crashes to Sentry (also requires VITE_SENTRY_DSN). Read live, per failure, by
   * `captureError` in `lib/report.ts` — so flipping this off stops the next event rather
   * than the next page load, and unlike the Fathom script there is nothing already
   * injected that we cannot take back.
   */
  errorReporting: boolean
}

const privacy: PrivacySettings = {
  analytics: true,
  ipLookup: true,
  errorReporting: true,
}

/**
 * Read a boolean custom-element attribute — the shared reader for all four of them
 * (`map` included), so the spelling can't diverge per attribute. r2wc hands every
 * attribute through as a string, and `false`/`0` are the two an integrator writes to
 * turn something off. Anything else (absent, empty, `true`) leaves the feature on: an
 * attribute nobody set must never silently disable a flow the host relies on.
 */
export const attributeEnabled = (value?: string | null): boolean =>
  value !== 'false' && value !== '0'

export default privacy
