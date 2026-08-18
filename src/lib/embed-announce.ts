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

import { clearReadiness, publishReadiness } from './readiness'
import { errorMessage, reportIntegrationWarning } from './report'

import api from '@/config/api'

/**
 * Whether this page's mount has already attested and reported.
 *
 * It lives here rather than in `Widget.tsx` because "one marker and one POST per page" is a
 * wiring guarantee like the `.catch` below, and `Widget.tsx` has no spec that could hold it —
 * a duplicate send is precisely the regression no gate would see.
 */
let announced = false

/**
 * Wait for the host's page to be idle.
 *
 * The report has no deadline — by the docblock below it feeds an admin picker — while the widget's
 * own `clients/me`, `geojson` and `regions` reads are what the visitor is waiting for, and all four
 * go to the same origin from the same mount. So the POST yields to them rather than competing, the
 * same call the loader already makes before it runs detection at all (`src/loader/index.ts`).
 *
 * Falls back to a macrotask where `requestIdleCallback` is missing — Safari below 17, and the node
 * lane — so awaiting this always settles.
 */
const whenIdle = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 2000 })
    } else {
      setTimeout(resolve, 0)
    }
  })

/**
 * Publish the marker and send the report — **once per page**, on the first call that means it.
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
 * The report is sent on **every** page load rather than only when the fingerprint changed. That
 * gate (#149) made `lastSeen` useless as a liveness signal: an unchanged, healthy embed would
 * report once, ever. The server suppresses an unchanged report for an hour, so the real cost is at
 * most one write per mount per hour.
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
  // to prevent, so those surfaces publish none — and have no mount to report either. Deliberately
  // ahead of the once-flag: a surface that announced nothing has not announced.
  if (announced || !observed) return

  announced = true

  publishReadiness({ routing, topLevel: observed.topLevel, urlWritable: observed.urlWritable })

  if (!report) return

  await whenIdle()

  try {
    await api.reportEmbed(report)
  } catch (error) {
    // The mount is rebuilt from the two fields that were sent rather than imported from
    // `loader/report.ts`, because a single *value* import from `src/loader/` makes that module
    // reachable from both build entries and rolldown hoists it into a chunk `auto.js` then has to
    // fetch on every host page view — the exact regression `src/loader/literals.ts` predicts, and
    // one `pnpm size` did not catch until this branch taught it to (scripts/check-bundle-size.mjs).
    reportIntegrationWarning(
      `could not record this embed with SahajCloud — ${errorMessage(error) ?? 'the request failed'}` +
        ` (mount: ${report.origin}${report.pathname}). The widget itself is unaffected; this` +
        ' record only feeds the canonical-URL picker in the Atlas admin.',
    )
  }
}

/**
 * Forget that this page announced, and take the marker down.
 *
 * Paired with `Widget.tsx`'s `releaseOwnership`, so the element that replaces this one attests and
 * reports for itself rather than inheriting a claim made on another key's behalf — and so a marker
 * cannot outlive the widget it vouches for on a host SPA that unmounted it.
 */
export function releaseAnnouncement(): void {
  announced = false
  clearReadiness()
}
