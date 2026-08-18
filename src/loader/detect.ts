/**
 * What the loader can work out about the page it landed on — as a pure function over signals the
 * caller measured, so the whole decision is testable in the node lane with no DOM (#149).
 *
 * **Why the loader observes instead of being told.** The client records carry a hand-maintained
 * `embed_type`, and it is wrong in the field: `sahajayoga.at` is recorded as `script` and in fact
 * serves an `<iframe>`. Integration metadata that a person has to keep in step with a website
 * they do not run goes stale silently, and every downstream decision — above all, whether this
 * mount can carry a canonical URL — inherits the error. So the widget looks, and reports.
 *
 * **The result is a record, never a gate.** The loader acts on what it measured *now*, locally,
 * on this load. It never waits on the server's copy: a round trip before render would add
 * latency to every embed, and a stale stored value would produce a visibly broken widget. What
 * gets stored is evidence for a human deciding which mount is canonical — see
 * `src/loader/report.ts`.
 */
import type { RoutingMode } from './config'

export type DetectionSignals = {
  /** `window.self === window.top`. False inside a platform sandbox (Wix/Weebly HTML embeds). */
  topLevel: boolean
  /** A no-op `replaceState` succeeded — false in a sandboxed or `file://` document. */
  urlWritable: boolean
  /** A written query param survived the host router. Only meaningful under query routing. */
  paramPersisted: boolean
}

/**
 * How the widget renders: in the host's own document, or inside a frame.
 *
 * **`inline` rather than the `component` this shipped as** (#153). The name is SahajCloud's —
 * `EMBED_MODES` in its `embedMetadata.ts`, published at `/api/docs` and validating both the report
 * body and the stored column — so the two spellings are not equal candidates: ours is the one that
 * can change without a deployed contract moving under it.
 */
export type EmbedMode = 'inline' | 'iframe'

export type EmbedFingerprint = DetectionSignals & {
  mode: EmbedMode
  routing: RoutingMode
  /**
   * Whether a canonical URL pointed at this mount would actually restore the view.
   *
   * Deliberately **not** the same question as "does the widget work here". A cross-origin frame
   * renders perfectly well and is still worthless as a canonical: the indexable document is the
   * host's, we cannot write its head, and the `?atlas=` on its URL never reaches us. Conflating
   * the two is how a canonical ends up naming a URL that shows the wrong thing.
   */
  canonicalViable: boolean
}

/**
 * Reduce measured signals to the fingerprint that gets acted on and reported.
 *
 * The routing modes fail differently, so they are asked different questions. Query routing needs
 * the param to survive the host's router — measured, not assumed, because a host SPA that rewrites
 * the URL on boot would silently swallow it.
 *
 * **Path routing is not fully answerable from here, and says so rather than guessing.** What it
 * actually needs is the host's server serving the widget's routes under a prefix, which is a
 * server fact no client-side probe can see: a page that renders is exactly what a correct setup
 * and a soft-404 both look like. So the client half is reported, and the deciding half is the
 * client record — the same field SahajCloud composes the canonical from, which is what stops the
 * two disagreeing.
 */
export function fingerprint(signals: DetectionSignals, routing: RoutingMode): EmbedFingerprint {
  const mode: EmbedMode = signals.topLevel ? 'inline' : 'iframe'

  return {
    ...signals,
    mode,
    routing,
    // `topLevel` because a frame's URL is not the indexable one, `urlWritable` because a route we
    // cannot write is a route nobody can link to, and `paramPersisted` because a `?atlas=` the
    // host's router eats is a canonical that restores the wrong view.
    //
    // **All three are MEASUREMENTS, and that is the point.** This used to exempt `routing === 'path'`
    // from the third — reasoning that path routing never uses the param, and that the deciding half
    // is a server fact no client probe can see. But `routing` comes off the host's own script URL
    // (`?routing=path`) while `mountDecision` hard-codes the effective shape to `query`, so the
    // exemption let any host turn the one judgement in this payload on for a mount that is in fact
    // query-routing with a parameter their router demonstrably eats — and nothing server-side could
    // contradict it, since the endpoint stores no `canonicalViable` to cross-check. Restore the
    // exemption in the same commit that teaches `mountDecision` to honour path routing, not before.
    canonicalViable: signals.topLevel && signals.urlWritable && signals.paramPersisted,
  }
}
