/**
 * What the loader can work out about the page it landed on.
 *
 * This is a pure function over signals the caller measured, so the whole decision is testable in
 * the node lane with no DOM (#149).
 *
 * **Why the loader observes, instead of being told.** The client records carry a hand-maintained
 * `embed_type`, and it is wrong in the field. `sahajayoga.at` is recorded as `script`, but it
 * actually serves an `<iframe>`. Integration metadata that a person must keep in step with a
 * website they do not run goes stale silently. Every downstream decision then inherits the
 * error — above all, whether this mount can carry a canonical URL. So the widget looks, and
 * reports what it sees.
 *
 * **The result is a record, never a gate.** The loader acts on what it measured *now*, locally,
 * on this load. It never waits on the server's copy. A round trip before render would add
 * latency to every embed, and a stale stored value would produce a visibly broken widget. What
 * gets stored is evidence for a human deciding which mount is canonical — see `src/lib/mount.ts`,
 * joined to the mount at the send site.
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
 * **This uses `inline`, not the `component` name it shipped with** (#153). `EMBED_MODES` belongs
 * to SahajCloud — defined in its `embedMetadata.ts`, published at `/api/docs`, and used to
 * validate both the report body and the stored column. So the two spellings are not equal
 * candidates. Only ours can change without moving a deployed contract.
 */
export type EmbedMode = 'inline' | 'iframe'

export type EmbedFingerprint = DetectionSignals & {
  mode: EmbedMode
  routing: RoutingMode
  /**
   * Whether a canonical URL pointed at this mount would actually restore the view.
   *
   * This is deliberately **not** the same question as "does the widget work here". A
   * cross-origin frame renders perfectly well, and is still worthless as a canonical. The
   * indexable document is the host's. This code cannot write its head. The `?atlas=` on its URL
   * never reaches this widget. Conflating the two questions is how a canonical ends up naming a
   * URL that shows the wrong thing.
   */
  canonicalViable: boolean
}

/**
 * Reduce measured signals to the fingerprint that gets acted on and reported.
 *
 * The routing modes fail differently, so this asks each one a different question. Query routing
 * needs the parameter to survive the host's router. This code measures that, rather than
 * assuming it, because a host SPA that rewrites the URL on boot would silently swallow it.
 *
 * **Path routing is not fully answerable from here, and this says so rather than guessing.**
 * Path routing actually needs the host's server to serve the widget's routes under a prefix.
 * That is a server fact no client-side probe can see — a page that renders looks exactly like
 * both a correct setup and a soft-404. So this reports only the client half. The client record
 * decides the other half. It is the same field SahajCloud uses to compose the canonical, which
 * keeps the two from disagreeing.
 */
export function fingerprint(signals: DetectionSignals, routing: RoutingMode): EmbedFingerprint {
  const mode: EmbedMode = signals.topLevel ? 'inline' : 'iframe'

  return {
    ...signals,
    mode,
    routing,
    // `topLevel` matters because a frame's URL is not the indexable one. `urlWritable` matters
    // because a route this code cannot write is a route nobody can link to. `paramPersisted`
    // matters because a `?atlas=` the host's router eats produces a canonical that restores the
    // wrong view.
    //
    // **All three are MEASUREMENTS, and that is the point.** This code used to exempt
    // `routing === 'path'` from the third check. The reasoning was that path routing never uses
    // the parameter, and that the deciding half is a server fact no client probe can see. That
    // exemption let any host turn on the one judgement in this payload, for a mount that is in
    // fact query-routing with a parameter their router demonstrably eats. Nothing server-side
    // could contradict it, because the endpoint stores no `canonicalViable` value to cross-check.
    //
    // ⚠ **An earlier version of this note said to restore the exemption "in the same commit that
    // teaches `mountDecision` to honour path routing". That commit has landed. The exemption
    // stays off, permanently.** Its premise was that the effective shape was hard-coded. The
    // real reason is stronger, and does not expire: this code runs in the LOADER, at script
    // execution, from `config.routing` alone. Whether path routing is actually honoured depends
    // on a prefix that arrives on the client record much later, and on the page matching it. So
    // from here, `routing === 'path'` is a REQUEST, not a finding. Exempting a request is exactly
    // what let a query-routed mount claim to be canonical.
    canonicalViable: signals.topLevel && signals.urlWritable && signals.paramPersisted,
  }
}
