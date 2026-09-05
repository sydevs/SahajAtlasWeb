import { QueryClient } from '@tanstack/react-query'

import { classifyError } from '@/lib/report'

// ── Freshness windows ───────────────────────────────────────────────────────────

/**
 * This is the floor under every query that does not name its own window.
 *
 * React Query's default is 0. Every query goes stale the instant it arrives.
 * So every mount refetches in the background, even when the data landed a moment ago.
 * Two costs matter here, and both are measurable.
 * The hover prefetch pays for itself and is then thrown away: it warms the detail, the viewer clicks, and the view's own mount immediately re-requests the same id.
 * The drawer stack also remounts a view on every navigation, so moving back and forth costs a fresh round trip each way.
 * Half a minute sits comfortably inside "the same interaction," and comfortably outside "this might have changed."
 *
 * This is a floor, not a policy.
 * The caches that know their own cadence override it below.
 */
export const DEFAULT_STALE_TIME = 30 * 1000

// The geojson feed is map-wide, and it changes rarely.
// This treats it as fresh for a few minutes.
// So the map and the hierarchy fetchers share a single fetch and parse.
export const GEOJSON_STALE_TIME = 5 * 60 * 1000

// The wholesale region tree changes on a slower cadence than events. Regions are added rarely.
// This keeps it fresh far longer.
// So navigation never re-reads `/regions` within a session, the whole point of caching it once.
export const REGIONS_STALE_TIME = 30 * 60 * 1000

/**
 * The derived results list stays fresh for exactly as long as the feed it derives FROM.
 *
 * `getEvents` issues no request of its own.
 * It reads the already-cached `['geojson']` entry, and re-runs the full-feed filter, a per-event zod parse, and a distance sort over the survivors.
 * Recomputing that more often than the feed can change is work with no possible new answer.
 * So this deliberately reuses `GEOJSON_STALE_TIME`, rather than choosing an independent number.
 * At worst, the two windows fall out of phase, and the list trails the feed by up to one window.
 * For a feed of scheduled classes, that gap is nothing, and the next navigation past the window closes it.
 */
export const EVENTS_STALE_TIME = GEOJSON_STALE_TIME

// ── Retention windows ───────────────────────────────────────────────────────────

/**
 * This is how long the WHOLESALE caches survive with nothing observing them.
 *
 * `['regions']`, `['geojson']`, and `['event-titles', locale]` are the fetch-once spine the rest of the data layer assumes.
 * Every hierarchy read, every count, and every card title comes out of them.
 * React Query's default `gcTime` is 5 minutes from the moment the last observer unmounts.
 * That default is shorter than `REGIONS_STALE_TIME`, so the region tree could be evicted while still nominally fresh.
 * The "cached once per session" architecture would then quietly become "re-downloaded after every idle gap."
 * This exposure is worst exactly where it is least visible.
 * A `map=false` embed holds no observer on the feed at all, so the whole dataset becomes a garbage-collection candidate the moment a navigation finishes.
 *
 * An hour outlives any idle gap within one page view.
 * The cost is bounded and known: one entry each, plus one titles sliver per locale the visitor actually switches to.
 */
export const WHOLESALE_GC_TIME = 60 * 60 * 1000

/**
 * The derived events cache gets a shorter leash than the wholesale ones.
 * Unlike them, it GROWS with use: one entry per quantized center, filter set, and locale combination the session visits, each holding its own freshly-parsed copy of the matching set.
 *
 * The floor is `EVENTS_STALE_TIME`.
 * React Query starts the gc clock when the last observer unmounts, never before the data landed.
 * So anything less would evict entries while still fresh, and make the stale window unobservable.
 * The doubling on top deliberately buys the STALE half.
 * `useSuspenseQuery` re-paints instantly from a stale entry and revalidates behind it, but SUSPENDS when the entry is gone.
 * So retention past staleness is the difference between a repaint and a spinner, on a drawer the viewer left ten minutes ago.
 * Two windows is the point where that stops being worth the memory.
 */
export const EVENTS_GC_TIME = 2 * EVENTS_STALE_TIME

// ── Retry pressure ──────────────────────────────────────────────────────────────

/**
 * This is how many extra attempts a failed read gets.
 *
 * React Query's default is 3.
 * That default is the wrong shape for a widget embedded on pages we do not own, at whatever traffic those pages carry.
 * Every client would quadruple its request count against SahajCloud during precisely the outage that made the first request fail.
 * One retry still absorbs the dropped packet or cold-start blip that automatic retries exist for.
 * Past that, the error boundary shows a "Try again" button, through `ERROR_POLICY`.
 * So further attempts become a decision one viewer makes, rather than one every client makes simultaneously.
 */
export const MAX_QUERY_RETRIES = 1

/** This is a ceiling on the backoff. A retry can never sit on a spinner for React Query's default 30s. */
export const MAX_RETRY_DELAY = 4000

/**
 * This decides whether a failed query is worth retrying. This function is pure, and it is exported so its spec can pin it.
 *
 * `failureCount` is React Query's own value. It is 0 on the first failure, since query-core's retryer increments it after asking.
 * So `< MAX_QUERY_RETRIES` allows exactly that many extra attempts.
 *
 * This never retries a 4xx response.
 * The server answered, and it will answer the same way.
 * A missing event stays missing. A rejected API key stays rejected.
 * A 429 is the server explicitly asking for LESS traffic, so retrying it is the one response that makes things worse.
 * Only 5xx, network, and unrecognized failures get a second chance.
 *
 * This reads the raw `status` because `classifyError` deliberately maps only some statuses.
 * It maps 401 and 403 to `config`, 404 to `not-found`, and 5xx to `server`.
 * Statuses 400, 409, 422, and 429 fall through to `unknown` there, which is right for what the screen SAYS, and wrong for whether to try again.
 * This is not a second, independent status table.
 * Everything this function cannot decide, it hands straight to the classifier.
 *
 * Our own throws, through `atlasError`, carry no HTTP status at all, so this reads them through `classifyError`.
 * `not-found` and `config` are the same "answered, definitively" cases in our own vocabulary.
 * A dead region link and a missing API key both fail identically on attempt two.
 * `offline` is deliberately still retryable.
 * React Query's default `networkMode: 'online'` pauses those attempts, rather than burning them.
 * `captcha-blocked` is retryable for the reason its `ERROR_POLICY` row gives.
 * A blocked script and a failed script request are one verdict here, and the second of those recovers.
 * This kind is thrown during render rather than by a query, though, so nothing routes it through here today.
 *
 * **The kind list here mirrors the `retry` column of `ERROR_POLICY`**, in `components/molecules/Fallbacks`.
 * That column decides whether the viewer sees a "Try again" button for the same failure.
 * These are two statements of one judgement, in two layers.
 * A new kind, or a flipped flag, must change in both places.
 * Unifying them would need a `RETRYABLE_KINDS` constant in `lib/report.ts` that both import.
 * That change is worth doing, but out of scope here, since it edits a molecule a sibling branch holds.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false

  try {
    const status = (error as { status?: unknown } | null | undefined)?.status

    if (typeof status === 'number' && status >= 400 && status < 500) {
      // 408, Request Timeout, and 425, Too Early, are the two 4xx codes that describe a moment, not a verdict.
      // The request never really got a hearing, so a second one is not the same request again.
      // Everything else in the range is an answer.
      return status === 408 || status === 425
    }

    const kind = classifyError(error)

    return kind !== 'not-found' && kind !== 'config'
  } catch {
    // This is guarded for the same reason `classifyError` is.
    // This function runs inside the retryer, on whatever a third party rejected with.
    // A throwing `status` getter must not escape into React Query's internals.
    // This does not retry an unreadable failure. There is no way to tell whether a second attempt would be anything but more load.
    return false
  }
}

/**
 * This is how long to wait before that retry: exponential, capped, and jittered.
 * This function is pure, since the randomness is injected, so the spec can pin it.
 *
 * The jitter matters more than the curve, at one retry.
 * When SahajCloud comes back after an outage, every embedded widget that failed at the same instant would otherwise retry at the same instant.
 * The recovering API's reward for coming back would then be a synchronized second wave.
 * Spreading each client's wait across the back half of its window smears that wave instead.
 */
export function retryDelayFor(failureCount: number, random: () => number = Math.random): number {
  const backoff = Math.min(1000 * 2 ** failureCount, MAX_RETRY_DELAY)

  return Math.round(backoff * (0.5 + random() * 0.5))
}

// This is one QueryClient, shared between the React tree, `providers.tsx`, and the data layer, `config/api`.
// The hierarchy fetchers read the already-loaded geojson feed from this cache.
// This avoids re-fetching and re-parsing it on every navigation. See `loadGeojson` in `fetch.ts`.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: DEFAULT_STALE_TIME,
      retry: shouldRetryQuery,
      // This wraps the function, instead of passing it by reference.
      // React Query calls this as `retryDelay(failureCount, error)`.
      // The helper's second parameter is the injected RNG its spec pins.
      // Handed an Error instead, it would throw inside the retryer.
      retryDelay: (failureCount) => retryDelayFor(failureCount),
    },
    mutations: {
      // This is explicit even though it matches React Query's default. The default is not the reason.
      // Both mutations this app has are unsafe to repeat.
      // `POST /events/:id/register` treats an automatic re-send as a duplicate signup, not a recovered one.
      // `POST /contact-admin` would replay a single-use Turnstile token the server has already redeemed.
      // That replay would be refused anyway, or worse, it could send the report twice.
      // A `retry` value added to `queries` above must never be assumed to cover mutations too.
      retry: 0,
    },
  },
})
