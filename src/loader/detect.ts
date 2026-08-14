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
  /** Path routing only: the current pathname actually sits under the configured `mount`. */
  mountMatches: boolean
}

/** How the widget renders: in the host's own document, or inside a frame. */
export type EmbedMode = 'component' | 'iframe'

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
 * the URL on boot would silently swallow it. Path routing needs no param, but does need the host's
 * server to be serving the widget's routes under `mount`; the closest thing to that a client-side
 * check can see is whether the pathname we were loaded on is under the prefix at all.
 */
export function fingerprint(signals: DetectionSignals, routing: RoutingMode): EmbedFingerprint {
  const mode: EmbedMode = signals.topLevel ? 'component' : 'iframe'
  const routeSurvives = routing === 'path' ? signals.mountMatches : signals.paramPersisted

  return {
    ...signals,
    mode,
    routing,
    // All three must hold. `topLevel` because a frame's URL is not the indexable one;
    // `urlWritable` because a route we cannot write is a route nobody can link to; and the
    // per-mode check because a URL that does not restore the view is worse than no canonical.
    canonicalViable: signals.topLevel && signals.urlWritable && routeSurvives,
  }
}

/**
 * Has anything changed since the server last heard from us?
 *
 * The loader reports only on a difference, so the steady state is zero writes and a client
 * redesigning their site self-corrects on the next visit — no cron, no revalidation schedule, and
 * no write path exercised on every page view of every embed.
 *
 * Compares only the observed fields. `lastSeen` is deliberately excluded: including it would make
 * every load a difference, which is precisely the write storm this check exists to prevent.
 */
export function fingerprintChanged(
  next: EmbedFingerprint,
  previous: Partial<EmbedFingerprint> | null | undefined,
): boolean {
  if (!previous) return true

  return (
    next.mode !== previous.mode ||
    next.routing !== previous.routing ||
    next.topLevel !== previous.topLevel ||
    next.urlWritable !== previous.urlWritable ||
    next.paramPersisted !== previous.paramPersisted ||
    next.mountMatches !== previous.mountMatches ||
    next.canonicalViable !== previous.canonicalViable
  )
}
