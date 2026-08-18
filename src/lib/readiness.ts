/**
 * The readiness marker — how a server-side verifier can tell this embed actually booted (#153).
 *
 * SahajCloud only builds a canonical URL from an embed it verified *itself*: it loads the host
 * page through Cloudflare Browser Rendering and looks for what this module writes. Reports
 * nominate a mount; the render decides. That is what stops a forged report reshaping a live
 * canonical URL, so this attribute is the whole evidentiary basis of the feature.
 *
 * **Why a DOM attribute and not a `postMessage`.** The Browser Rendering REST API renders a page
 * and hands back DOM; there is no message channel to listen on, and a listener injected into the
 * page would race the widget's own boot — which fails *healthy* sites, the one outcome a verifier
 * must never produce. An attribute is raceless: whenever the DOM is sampled, it is either there or
 * it is not. One mechanism, not two — the verifier is the only consumer.
 *
 * **It goes on `<html>`, which is the host's element, not ours.** The widget scopes everything
 * else to its own subtree on purpose (`lib/scope.ts`), so this is a deliberate exception: the
 * verifier reads the rendered document from the top and cannot be asked to find our wrapper first.
 * It is one namespaced `data-` attribute, and it is removed again when the widget goes away.
 */
import type { RoutingMode } from '@/loader/config'

/** The attribute SahajCloud's verifier reads. Changing it is a cross-repo break. */
export const READY_ATTR = 'data-sahaj-atlas-ready'

/**
 * The marker's contract version, stored by the verifier as `widgetVersion`.
 *
 * A number rather than a string because SahajCloud's `VerifiedEmbed` schema types it as one. It
 * versions *this JSON's shape*, not the widget release: bump it when a field is added, removed or
 * changes meaning, so a verifier meeting an older embed can tell which fields it may trust rather
 * than inferring it from what happens to be present.
 */
export const READY_CONTRACT_VERSION = 2

/**
 * What the marker attests. Every field is read by the verifier, so none of them is decorative.
 *
 * `routing` is the point of the whole exercise: reading it here rather than from the client's own
 * report is what makes routing *server-attested*. It is the URL shape the widget uses, which is
 * why a mount that degraded to memory routing still reports its configured shape and says so
 * through `urlWritable` instead — a canonical URL is built from the shape, and whether this mount
 * can carry one at all is the other two fields' job.
 */
export type ReadinessMarker = {
  v: number
  routing: RoutingMode
  topLevel: boolean
  urlWritable: boolean
}

export function readinessMarker(marker: Omit<ReadinessMarker, 'v'>): ReadinessMarker {
  return { v: READY_CONTRACT_VERSION, ...marker }
}

/**
 * Publish the marker on the host document.
 *
 * **Only ever call this once the widget has genuinely mounted and rendered.** A marker written on
 * script load attests to nothing — it would go up on a page whose widget then failed to boot, and
 * turn verification into theatre. The one caller (`Widget.tsx`) fires it from a mount effect,
 * after React has committed the widget's DOM.
 *
 * Guarded like every other read of a document we do not own: a host may have frozen the element or
 * be serving something exotic, and a diagnostic must never break the thing it is diagnosing.
 */
export function publishReadiness(marker: Omit<ReadinessMarker, 'v'>): void {
  try {
    document.documentElement.setAttribute(READY_ATTR, JSON.stringify(readinessMarker(marker)))
  } catch {
    // A marker we could not write is a verification that comes back inconclusive, which is the
    // honest outcome — and never a reason to take the widget down with it.
  }
}

/**
 * Take the marker down again.
 *
 * A host SPA that unmounts the widget on a route change would otherwise leave an attestation
 * standing over a page that no longer has an embed on it — the same "attests to nothing" failure
 * as writing it too early, arrived at from the other end.
 */
export function clearReadiness(): void {
  try {
    document.documentElement.removeAttribute(READY_ATTR)
  } catch {
    // As above.
  }
}
