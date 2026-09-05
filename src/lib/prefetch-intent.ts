/**
 * Hover intent + a concurrency ceiling for speculative prefetching.
 *
 * The problem it exists for: warming an event's detail on `mouseenter` is free when the
 * pointer is *arriving* at a card, and pure waste when it is merely *passing over* one.
 * A results list pages to hundreds of rows, so dragging the cursor down it fires one
 * `GET /events/:id` per row traversed. These are distinct keys, so React Query's dedup
 * cannot help. The widget is also embedded on pages we do not own, so that burst lands
 * on SahajCloud multiplied by however many visitors are sweeping a list at once.
 *
 * Two independent bounds, because either alone leaks:
 *
 * - **Dwell.** A warm fires only after the pointer (or focus) has rested on one row for
 *   `HOVER_DWELL_MS`. Crossing a ~72 px row in a sweep takes tens of milliseconds. A
 *   deliberate hover before a click lasts several hundred. The delay sits in the gap,
 *   so a sweep fires nothing and a real hover still warms well before the click lands.
 * - **Concurrency.** Even deliberate hovering, held long enough, walks a list one warm
 *   at a time. `maxInFlight` caps how many can be outstanding. Over the cap a warm is
 *   *dropped*, never queued — a queue would just deliver the storm late, and the one
 *   card the viewer actually opens fetches through its own suspense read anyway.
 *
 * Kept pure and React-free (a plain closure over `setTimeout`) so the node unit lane can
 * drive it with fake timers — the behaviour worth testing here is timing, and asserting
 * timing through a rendered component would need a DOM to say nothing extra.
 */

/**
 * How long a pointer or focus must rest on one row before its detail is warmed.
 *
 * 150 ms is the classic hover-intent dwell and it sits in a wide gap: a cursor sweeping
 * a list clears a row in ~10–30 ms, while hover-to-click on a deliberate target runs
 * 300–800 ms. So the whole sweep is filtered out and a genuine hover still leaves most
 * of its travel time for the request — which is the point of prefetching at all.
 */
export const HOVER_DWELL_MS = 150

/**
 * How many speculative warms may be outstanding at once.
 *
 * One would be defensible. Two covers the real pattern where someone moves on to the
 * next card while the first is still in flight. Beyond that, the requests are
 * speculation the API pays for and the viewer cannot use. They can only open one event.
 */
export const MAX_CONCURRENT_PREFETCH = 2

export type PrefetchIntentOptions = {
  /** Dwell before a warm fires, in ms. Defaults to {@link HOVER_DWELL_MS}. */
  delay?: number
  /** Ceiling on outstanding warms. Defaults to {@link MAX_CONCURRENT_PREFETCH}. */
  maxInFlight?: number
}

export type PrefetchIntent = {
  /**
   * The pointer/focus arrived on `key`. This starts the dwell, and supersedes any row
   * still waiting out its own dwell, since only one row can be hovered at a time.
   */
  enter: (key: number, run: () => unknown) => void
  /**
   * The pointer/focus left `key`. This cancels its pending warm, but only if `key` is
   * still the pending one. So a late `mouseleave` for the row already moved past cannot
   * cancel the warm for the row now under the cursor.
   */
  leave: (key: number) => void
  /** Drop any pending dwell (teardown). In-flight warms are left to settle. */
  dispose: () => void
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PromiseLike<unknown>).then === 'function'

/**
 * Build a shared intent gate. **Share one instance across a whole list** — a per-card
 * instance would give every card its own `maxInFlight` budget, which is no budget at all.
 */
export function createPrefetchIntent({
  delay = HOVER_DWELL_MS,
  maxInFlight = MAX_CONCURRENT_PREFETCH,
}: PrefetchIntentOptions = {}): PrefetchIntent {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingKey: number | null = null
  let inFlight = 0

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pendingKey = null
  }

  // Floored, so `maxInFlight` is a hard ceiling no matter what a caller's `run` does. An
  // extra release would otherwise drive the counter negative and quietly RAISE the cap —
  // the one failure mode of a budget that nobody would think to look for.
  const release = () => {
    inFlight = Math.max(0, inFlight - 1)
  }

  const fire = (run: () => unknown) => {
    cancel()

    if (inFlight >= maxInFlight) return

    inFlight += 1

    try {
      const result = run()

      // Exactly one of these paths runs, and a settled promise calls back exactly once,
      // so the slot is returned exactly once without needing a latch to prove it.
      if (isThenable(result)) result.then(release, release)
      else release()
    } catch {
      // A speculative warm is best-effort by definition: nothing downstream is waiting
      // on it, and the view that needs the data reads it through its own query.
      release()
    }
  }

  return {
    enter(key, run) {
      // Already counting down for this row — leave the clock alone. A card fires `enter`
      // from BOTH `mouseenter` and `focus` (clicking one focuses its anchor), and
      // restarting on the second would make the dwell mean "150 ms since the last event"
      // instead of "rested here for 150 ms", pushing the warm past the click that needed it.
      if (pendingKey === key) return

      cancel()
      pendingKey = key
      timer = setTimeout(() => fire(run), delay)
    },
    leave(key) {
      if (pendingKey === key) cancel()
    },
    dispose: cancel,
  }
}
