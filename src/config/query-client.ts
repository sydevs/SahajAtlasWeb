import { QueryClient } from '@tanstack/react-query'

import { classifyError } from '@/lib/report'

// ── Freshness windows ───────────────────────────────────────────────────────────

/**
 * The floor under every query that doesn't name its own window.
 *
 * React Query's default is 0: every query is stale the instant it arrives, so every
 * mount refetches in the background even when the data landed a moment ago. Two costs
 * that matters for, both measurable — the hover prefetch pays for itself and is then
 * thrown away (warm the detail, click, and the view's own mount immediately re-requests
 * the same id), and the drawer stack remounts a view on every navigation, so moving
 * back and forth is a fresh round-trip each way. Half a minute is comfortably inside
 * "the same interaction" and comfortably outside "this might have changed".
 *
 * It is a floor, not a policy: the caches that know their own cadence override it below.
 */
export const DEFAULT_STALE_TIME = 30 * 1000

// The geojson feed is map-wide and changes rarely; treat it as fresh for a few
// minutes so the map and the hierarchy fetchers share a single fetch + parse.
export const GEOJSON_STALE_TIME = 5 * 60 * 1000

// The wholesale region tree changes on a slower cadence than events (regions are
// added rarely); keep it fresh far longer so navigation never re-reads /regions
// within a session — the whole point of caching it once.
export const REGIONS_STALE_TIME = 30 * 60 * 1000

/**
 * The derived results list is fresh for exactly as long as the feed it derives FROM.
 *
 * `getEvents` issues no request: it reads the already-cached `['geojson']` and re-runs
 * the full-feed filter, a per-event zod parse and a distance sort over the survivors.
 * Recomputing that more often than the feed can change is work with no possible new
 * answer — so this is deliberately the same number as `GEOJSON_STALE_TIME` rather than
 * an independently chosen one. (Worst case the two windows are out of phase and the
 * list trails the feed by up to one window; for a feed of scheduled classes that is
 * nothing, and the next navigation past the window closes it.)
 */
export const EVENTS_STALE_TIME = GEOJSON_STALE_TIME

// ── Retention windows ───────────────────────────────────────────────────────────

/**
 * How long the WHOLESALE caches survive with nothing observing them.
 *
 * `['regions']`, `['geojson']` and `['event-titles', locale]` are the fetch-once spine
 * the rest of the data layer assumes: every hierarchy read, every count, every card
 * title comes out of them. React Query's default `gcTime` is 5 minutes from the moment
 * the last observer unmounts — shorter than `REGIONS_STALE_TIME`, so the region tree
 * could be evicted while still nominally fresh, and the "cached once per session"
 * architecture would quietly become "re-downloaded after every idle gap". The exposure
 * is worst exactly where it's least visible: a `map=false` embed holds no observer on
 * the feed at all, so the whole dataset is a garbage-collection candidate the moment a
 * navigation finishes.
 *
 * An hour outlives any idle gap within one page view. The cost is bounded and known:
 * one entry each, plus one titles sliver per locale the visitor actually switches to.
 */
export const WHOLESALE_GC_TIME = 60 * 60 * 1000

/**
 * The derived events cache gets a shorter leash than the wholesale ones, because unlike
 * them it GROWS with use: one entry per (quantized centre × filter set × locale) the
 * session visits, each holding its own freshly-parsed copy of the matching set.
 *
 * The floor is `EVENTS_STALE_TIME` — React Query starts the gc clock when the last
 * observer unmounts, never before the data landed, so anything less would evict entries
 * while still fresh and make the stale window unobservable. The doubling on top buys the
 * *stale* half deliberately: `useSuspenseQuery` re-paints instantly from a stale entry
 * and revalidates behind it, but SUSPENDS when the entry is gone — so retention past
 * staleness is the difference between a repaint and a spinner on a drawer the viewer
 * left ten minutes ago. Two windows is where that stops being worth the memory.
 */
export const EVENTS_GC_TIME = 2 * EVENTS_STALE_TIME

// ── Retry pressure ──────────────────────────────────────────────────────────────

/**
 * How many extra attempts a failed read gets.
 *
 * React Query's default is 3, which is the wrong shape for a widget embedded on pages
 * we don't own, at whatever traffic those pages have: every client would quadruple its
 * request count against SahajCloud during precisely the outage that made the first
 * request fail. One retry still absorbs the dropped packet / cold-start blip that
 * automatic retries exist for. Past that the error boundary shows a "Try again" button
 * (`ERROR_POLICY`), so further attempts are a decision one viewer makes rather than one
 * every client makes simultaneously.
 */
export const MAX_QUERY_RETRIES = 1

/** Ceiling on the backoff, so a retry can never sit on a spinner for React Query's default 30s. */
export const MAX_RETRY_DELAY = 4000

/**
 * Whether a failed query is worth retrying. Pure, and exported so its spec can pin it.
 *
 * `failureCount` is React Query's, which is **0 on the first failure** (query-core's
 * retryer increments after asking), so `< MAX_QUERY_RETRIES` allows exactly that many
 * extra attempts.
 *
 * A 4xx is never retried. The server answered, and it will answer the same way: a
 * missing event stays missing, a rejected API key stays rejected, and a 429 is the
 * server explicitly asking for *less* traffic — retrying it is the one response that
 * makes things worse. Only 5xx, network and unrecognised failures get a second chance.
 *
 * The raw `status` read exists **because `classifyError` deliberately maps only some
 * statuses** (401/403 → config, 404 → not-found, 5xx → server): 400/409/422/429 fall
 * through to `unknown` there, which is right for what the screen SAYS and wrong for
 * whether to try again. It is not a second, independent status table — everything it
 * can't decide is handed straight to the classifier.
 *
 * Our own throws (`atlasError`) carry no HTTP status at all, so they're read through
 * `classifyError`: `not-found` and `config` are the same "answered, definitively" cases
 * in our own vocabulary — a dead region link and a missing API key both fail identically
 * on attempt two. `offline` is deliberately still retryable; React Query's default
 * `networkMode: 'online'` pauses those rather than burning the attempt.
 *
 * **The kind list here mirrors the `retry` column of `ERROR_POLICY`**
 * (`components/molecules/Fallbacks`), which decides whether the viewer is offered a
 * "Try again" button for the same failure. They are two statements of one judgement in
 * two layers; a new kind, or a flipped flag, has to be made in both. Unifying them means
 * a `RETRYABLE_KINDS` in `lib/report.ts` that both import — worth doing, out of scope
 * here (it edits a molecule a sibling branch holds).
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false

  try {
    const status = (error as { status?: unknown } | null | undefined)?.status

    if (typeof status === 'number' && status >= 400 && status < 500) {
      // 408 (Request Timeout) and 425 (Too Early) are the two 4xx that describe a moment
      // rather than a verdict — the request never really got a hearing, so a second one is
      // not the same request again. Everything else in the range is an answer.
      return status === 408 || status === 425
    }

    const kind = classifyError(error)

    return kind !== 'not-found' && kind !== 'config'
  } catch {
    // Guarded for the same reason `classifyError` is: this runs inside the retryer on
    // whatever a third party rejected with, and a throwing `status` getter must not
    // escape into React Query's internals. An unreadable failure isn't retried — we
    // can't tell whether a second attempt would be anything but more load.
    return false
  }
}

/**
 * How long to wait before that retry — exponential, capped, and jittered. Pure (the
 * randomness is injected) so the spec can pin it.
 *
 * The jitter matters more than the curve at one retry. When SahajCloud comes back after
 * an outage, every embedded widget that failed at the same instant would otherwise
 * retry at the same instant, and the recovering API's reward for coming back is a
 * synchronized second wave. Spreading each client's wait across the back half of its
 * window smears that wave instead.
 */
export function retryDelayFor(failureCount: number, random: () => number = Math.random): number {
  const backoff = Math.min(1000 * 2 ** failureCount, MAX_RETRY_DELAY)

  return Math.round(backoff * (0.5 + random() * 0.5))
}

// One QueryClient shared between the React tree (providers.tsx) and the data
// layer (config/api). The hierarchy fetchers read the already-loaded geojson
// feed from this cache instead of re-fetching + re-parsing it on every
// navigation (see fetch.ts `loadGeojson`).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: DEFAULT_STALE_TIME,
      retry: shouldRetryQuery,
      // Wrapped rather than passed by reference: React Query calls this as
      // `retryDelay(failureCount, error)`, and the helper's second parameter is the
      // injected RNG its spec pins — handed an Error, it would throw inside the retryer.
      retryDelay: (failureCount) => retryDelayFor(failureCount),
    },
    mutations: {
      // Explicit even though it matches React Query's default, because the default is
      // not the reason. The one mutation this app has is `POST /events/:id/register`,
      // and an automatic re-send of a registration is a duplicate signup rather than a
      // recovered one — so a `retry` added to `queries` above must never be assumed to
      // have covered mutations too.
      retry: 0,
    },
  },
})
