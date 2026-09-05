/**
 * The readiness marker — how a server-side verifier can tell this embed actually booted (#153).
 *
 * SahajCloud only builds a canonical URL from an embed it verified *itself*: it loads the host
 * page through Cloudflare Browser Rendering and looks for what this module writes. Reports
 * nominate a mount. The render decides.
 *
 * **Be precise about what that buys, because the obvious reading is too strong.** This attribute
 * detects a *broken* embed, not a *forged* one. It carries no nonce and no signature, a host can
 * hand-write it into static HTML, and every field it holds comes from an API the host page can
 * patch (`window.self === window.top`, `history.replaceState`) — so any page that can run our
 * script can also fake our script's output, and no client-side mechanism can change that. The
 * trust boundary is `allowedDomains`, server-side, and a client lying about its own domain is
 * self-harm. What the marker genuinely adds is the case that actually happens: an embed that is
 * installed and *does not work*, which a report alone would never reveal because the report is
 * sent by the same widget whose health is in question.
 *
 * **Why a DOM attribute and not a `postMessage`.** The Browser Rendering REST API renders a page
 * and hands back DOM. There is no message channel to listen on, and a listener injected into the
 * page would race the widget's own boot, which fails *healthy* sites, the one outcome a verifier
 * must never produce. An attribute is raceless: whenever the DOM is sampled, it is either there or
 * it is not. One mechanism, not two. The verifier is the only consumer.
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
 * Two ways to attest to nothing, and this closes both of the ones that arrive *after* publishing.
 * A host SPA that unmounts the widget on a route change would otherwise leave an attestation
 * standing over a page with no embed on it. And a widget that boots and then **fails** — a host
 * CSP missing the API origin, a rejected key — renders the "could not be loaded" rung with the
 * marker still up, which is the false verification this whole mechanism exists to prevent: the
 * verifier would adopt that page as a region's canonical URL on the strength of a React commit.
 * So the two boundaries that replace the entire widget with an error screen call this
 * (`App.tsx`), and the marker means "mounted, and not currently broken".
 */
export function clearReadiness(): void {
  try {
    document.documentElement.removeAttribute(READY_ATTR)
  } catch {
    // As above.
  }
}
