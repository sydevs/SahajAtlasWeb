import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createPrefetchIntent, HOVER_DWELL_MS } from './prefetch-intent'

// Fake timers, no DOM: the helper is a plain closure over setTimeout precisely so the
// thing worth asserting here — that a sweep costs nothing and a rest costs one request
// — can be asserted directly instead of through a rendered list (issue #97).
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createPrefetchIntent — dwell', () => {
  it('fires nothing for a cursor swept down a long list', () => {
    const warmed: number[] = []
    const intent = createPrefetchIntent()

    // 40 rows crossed at 20 ms each — a fast drag, and the exact motion that used to
    // fire 40 distinct `GET /events/:id` (distinct keys, so no dedup to save it).
    for (let id = 1; id <= 40; id += 1) {
      intent.enter(id, () => warmed.push(id))
      vi.advanceTimersByTime(20)
      intent.leave(id)
    }

    vi.advanceTimersByTime(HOVER_DWELL_MS * 2)

    expect(warmed).toEqual([])
  })

  it('warms exactly once when the pointer rests on a row, and not before the dwell', () => {
    const warmed: number[] = []
    const intent = createPrefetchIntent()

    intent.enter(7, () => warmed.push(7))

    vi.advanceTimersByTime(HOVER_DWELL_MS - 1)
    expect(warmed).toEqual([])

    vi.advanceTimersByTime(1)
    expect(warmed).toEqual([7])

    // Still resting: the warm doesn't repeat on its own.
    vi.advanceTimersByTime(HOVER_DWELL_MS * 10)
    expect(warmed).toEqual([7])
  })

  it('lets a stale leave cancel only its own row', () => {
    const warmed: number[] = []
    const intent = createPrefetchIntent()

    intent.enter(1, () => warmed.push(1))
    intent.enter(2, () => warmed.push(2))
    // A late mouseleave/blur for the row already passed. Cancelling on it would mean the
    // row now under the cursor never warms — the dwell would silently become "never".
    intent.leave(1)

    vi.advanceTimersByTime(HOVER_DWELL_MS)

    expect(warmed).toEqual([2])
  })

  it('drops the pending warm on dispose (a card unmounting mid-hover)', () => {
    const warmed: number[] = []
    const intent = createPrefetchIntent()

    intent.enter(3, () => warmed.push(3))
    intent.dispose()
    vi.advanceTimersByTime(HOVER_DWELL_MS * 2)

    expect(warmed).toEqual([])
  })
})

describe('createPrefetchIntent — concurrency', () => {
  // Deliberate, slow hovering passes the dwell every time, so the cap is the second
  // bound: it stops a patient walk down the list from becoming the same storm in slow
  // motion.
  const pending = () => {
    const settle: Array<() => void> = []
    const warmed: number[] = []
    const run = (id: number) =>
      new Promise<void>((resolve) => {
        warmed.push(id)
        settle.push(resolve)
      })

    return { settle, warmed, run }
  }

  const dwellOn = (
    intent: ReturnType<typeof createPrefetchIntent>,
    id: number,
    run: () => unknown,
  ) => {
    intent.enter(id, run)
    vi.advanceTimersByTime(HOVER_DWELL_MS)
  }

  it('drops warms over the cap rather than queueing them', () => {
    const { warmed, run } = pending()
    const intent = createPrefetchIntent({ maxInFlight: 2 })

    for (const id of [1, 2, 3, 4]) dwellOn(intent, id, () => run(id))

    // Dropped, not deferred: a queue would deliver the same burst late, and the card the
    // viewer actually opens fetches through its own suspense read regardless.
    expect(warmed).toEqual([1, 2])
  })

  it('hands the budget back when a warm settles', async () => {
    const { settle, warmed, run } = pending()
    const intent = createPrefetchIntent({ maxInFlight: 2 })

    for (const id of [1, 2, 3]) dwellOn(intent, id, () => run(id))
    expect(warmed).toEqual([1, 2])

    settle[0]()
    await Promise.resolve()

    dwellOn(intent, 5, () => run(5))
    expect(warmed).toEqual([1, 2, 5])
  })

  it('does not leak a slot when the warm throws synchronously', () => {
    const warmed: number[] = []
    const intent = createPrefetchIntent({ maxInFlight: 1 })

    dwellOn(intent, 1, () => {
      throw new Error('prefetch exploded')
    })
    dwellOn(intent, 2, () => warmed.push(2))

    expect(warmed).toEqual([2])
  })
})
