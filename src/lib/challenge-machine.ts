/**
 * What the challenge frame posts (`hooks/use-turnstile.ts` parses it). `ready` is the handshake:
 * Turnstile is live in the frame. `error` includes SahajCloud refusing this page's origin, which no
 * client record lists. The page renders Turnstile `interaction-only`, so it is invisible until
 * Cloudflare wants a click: `interactive` and `settled` bracket that window (sydevs/SahajCloud#1090).
 */
export type ChallengeMessage =
  | { type: 'ready' }
  | { type: 'interactive' }
  | { type: 'settled' }
  | { type: 'expired' }
  | { type: 'error' }
  | { type: 'token'; token: string }

/**
 * The frame's messages, plus the owner's two: `reset`, asking the frame to run the challenge
 * again, and `spend`, taking the token for one submit.
 */
export type ChallengeEvent = ChallengeMessage | { type: 'reset' } | { type: 'spend' }

/**
 * `loading` until the challenge renders, `blocked` when Turnstile is unavailable. A caller must
 * degrade on `blocked` rather than leave a submit button that can never produce a token.
 */
export type TurnstileStatus = 'loading' | 'ready' | 'blocked'

/**
 * One mounted challenge frame, from its first silent moment to a token.
 *
 * - `loading`: mounted, nothing heard. Silence for {@link HANDSHAKE_TIMEOUT_MS} is `blocked`; any
 *   message at all proves the frame alive and leaves this state.
 * - `unsolved`: Turnstile is running and has not asked for anything.
 * - `needsClick`: Cloudflare wants a click, so the frame is shown.
 * - `solvedShown` / `solvedCollapsed` / `solvedSpent`: holding a token. Shown while the frame that
 *   asked for the click is still on screen, until `settled` collapses it. Spent once a submit has
 *   taken it: a token is single-use, so a second submit sent in the same tick finds none to take,
 *   and the owner resets after a failure. A spent token stays in hand so the form keeps its look
 *   while the POST is out.
 * - `blocked`: errored or silent. ⚠ It must NOT latch: Turnstile's `retry` defaults to `auto`, so a
 *   transient failure is often followed by a retry that solves, and a latched `blocked` would leave
 *   a visitor holding a valid token behind the mailto escape.
 *
 * Only a `solved*` state holds a token, and leaving the three of them drops it.
 */
export type ChallengeState =
  | 'loading'
  | 'unsolved'
  | 'needsClick'
  | 'solvedShown'
  | 'solvedCollapsed'
  | 'solvedSpent'
  | 'blocked'

export type ChallengeSnapshot = { state: ChallengeState; token: string | null }

/**
 * Bounds a frame that never answers. A `frame-src` that refuses it is silent to its parent, so
 * this is also how a host's stale CSP is found. Nothing blocks on it, so a generous bound costs a
 * late answer rather than a slow first paint. 10 seconds was not generous enough: a slow load
 * replaced a working Atlas with the blocked screen about once in 30 loads on an iPhone.
 */
export const HANDSHAKE_TIMEOUT_MS = 20_000

const isSolved = (state: ChallengeState): boolean => state.startsWith('solved')

/** Whether a submit can take the token: one that is held and not already spent. */
export const canSpend = (state: ChallengeState): boolean =>
  state === 'solvedShown' || state === 'solvedCollapsed'

type Row = Partial<Record<ChallengeEvent['type'], ChallengeState>>

/**
 * What any state does with a frame that failed or solved. A state's own row wins over this one,
 * which is how a `token` during the click window lands on `solvedShown` rather than collapsed.
 */
const ANY: Row = { error: 'blocked', token: 'solvedCollapsed' }

/** What all three `solved*` states share. */
const LEAVE_SOLVED: Row = { expired: 'unsolved', reset: 'unsolved' }

/** The whole transition table: state → event → next state. A missing cell changes nothing. */
const TABLE: Record<ChallengeState, Row> = {
  loading: { ready: 'unsolved', expired: 'unsolved', interactive: 'needsClick' },
  unsolved: { interactive: 'needsClick' },
  needsClick: { settled: 'unsolved', token: 'solvedShown', reset: 'unsolved' },
  solvedShown: { ...LEAVE_SOLVED, settled: 'solvedCollapsed', spend: 'solvedSpent' },
  solvedCollapsed: { ...LEAVE_SOLVED, spend: 'solvedSpent' },
  solvedSpent: { ...LEAVE_SOLVED },
  // A challenge that errored can still recover by itself, as above.
  blocked: { ready: 'unsolved', interactive: 'needsClick' },
}

/** One step of the table, which is the whole machine. */
export function challengeStep(
  { state, token }: ChallengeSnapshot,
  event: ChallengeEvent,
): ChallengeSnapshot {
  const next = TABLE[state][event.type] ?? ANY[event.type]

  if (next === undefined) return { state, token }

  return {
    state: next,
    token: event.type === 'token' ? event.token : isSolved(state) && !isSolved(next) ? null : token,
  }
}

/**
 * One mounted frame's challenge, as a store `useActorSelector` can read.
 *
 * ⚠ **Hand-rolled rather than XState, because `use-turnstile.ts` is in both eager graphs** through
 * the app-wide report form, so a library here is ~12 KiB gzipped on every host page
 * (`scripts/check-bundle-size.mjs`). Seven flat states and one timer fit a table; the locate and
 * sheet machines need invoked actors and parallel regions, and keep XState.
 *
 * The handshake clock is armed on construction and cleared the moment the frame leaves `loading`,
 * so any message at all proves it alive. `stop()` clears a clock still pending on unmount.
 */
export function createChallengeStore() {
  let snapshot: ChallengeSnapshot = { state: 'loading', token: null }
  const listeners = new Set<() => void>()
  let handshake: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    handshake = undefined
    commit({ state: 'blocked', token: null })
  }, HANDSHAKE_TIMEOUT_MS)

  function commit(next: ChallengeSnapshot) {
    if (next.state === snapshot.state && next.token === snapshot.token) return

    if (next.state !== 'loading' && handshake !== undefined) {
      clearTimeout(handshake)
      handshake = undefined
    }
    snapshot = next
    // A copy, so a listener unsubscribing in its own call cannot skip the next one.
    for (const listener of [...listeners]) listener()
  }

  return {
    getSnapshot: () => snapshot,
    send: (event: ChallengeEvent) => commit(challengeStep(snapshot, event)),
    subscribe(listener: () => void) {
      listeners.add(listener)

      return {
        unsubscribe: () => {
          listeners.delete(listener)
        },
      }
    },
    stop() {
      clearTimeout(handshake)
      handshake = undefined
      listeners.clear()
    },
  }
}

export type ChallengeStore = ReturnType<typeof createChallengeStore>
