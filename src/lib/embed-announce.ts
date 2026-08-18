/**
 * Attest that this embed booted, and tell SahajCloud what it found (#153).
 *
 * Two halves of one statement, so they live together: the marker
 * (`./readiness.ts`) is what a *server-side* verifier reads off the rendered page, and the report
 * is what the widget says about itself. SahajCloud trusts them differently on purpose — reports
 * nominate a mount, the render decides — which is why the routing published here is the shape the
 * router actually uses rather than the shape the report carries.
 *
 * **Separate from `Widget.tsx` because it has to be assertable.** The one thing this module
 * guarantees is that a refusal from the endpoint reaches the console instead of the host's page,
 * and that guarantee lives entirely in the wiring — a `.catch` that was never attached looks
 * exactly like one that was, to every pure test of the pieces. Importing `Widget.tsx` to exercise
 * it would drag mapbox-gl, vaul and every eager view into the node lane, the same argument
 * `views/DrawerStack/strip-label.ts` makes.
 *
 * `Widget.tsx` still owns *when* this runs — once, after a real mount, released with page-global
 * ownership. Calling it early is the failure this whole mechanism exists to prevent.
 */
import type { RoutingMode } from '@/loader/config'
import type { EmbedFingerprint } from '@/loader/detect'
import type { EmbedReport } from '@/loader/report'

import { publishReadiness } from './readiness'
import { errorMessage, reportIntegrationWarning } from './report'

import api from '@/config/api'
import { mountKey } from '@/loader/report'

/**
 * Publish the marker and send the report.
 *
 * **Resolves whatever happens.** This runs in a page we do not own, purely to produce a record for
 * an admin panel, so there is no failure here worth surfacing to a viewer — and an unhandled
 * rejection in a host's page is their bug report, not ours. The returned promise exists so a test
 * can wait for the send; the caller fires it and forgets.
 *
 * A refusal is still worth saying out loud, because both kinds name something a person has to fix:
 * **403** is an origin outside the client's `allowedDomains` — or no allowlist at all, which this
 * endpoint refuses rather than treating as allow-all — and **429** is the 50-mount cap. Neither
 * affects what the visitor sees, and the message says so, because a console error on somebody's
 * site that does not say "your widget is fine" will be read as "your widget is broken".
 *
 * The report is sent on **every** mount rather than only when the fingerprint changed. That gate
 * (#149) made `lastSeen` useless as a liveness signal: an unchanged, healthy embed would report
 * once, ever. The server suppresses an unchanged report for an hour, so the real cost is at most
 * one write per mount per hour.
 */
export async function announceEmbed(args: {
  /** The URL shape the router actually uses — not the one that was configured. */
  routing: RoutingMode
  /** What the loader probed, or `null` on a surface it never booted. */
  observed: EmbedFingerprint | null
  /** The same observation addressed to SahajCloud, or `null` when there is no mount to report. */
  report: EmbedReport | null
}): Promise<void> {
  const { routing, observed, report } = args

  // No loader means nothing was probed: the standalone dev entry and every Ladle story mount the
  // widget directly. A marker asserting an embed nobody measured is exactly the theatre it exists
  // to prevent, so those surfaces publish none — and have no mount to report either.
  if (!observed) return

  publishReadiness({ routing, topLevel: observed.topLevel, urlWritable: observed.urlWritable })

  if (!report) return

  try {
    await api.reportEmbed(report)
  } catch (error) {
    reportIntegrationWarning(
      `could not record this embed with SahajCloud — ${errorMessage(error) ?? 'the request failed'}` +
        ` (mount: ${mountKey(report)}). The widget itself is unaffected; this record only feeds` +
        ' the canonical-URL picker in the Atlas admin.',
    )
  }
}
