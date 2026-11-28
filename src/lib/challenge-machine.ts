import { type ActorRefFrom, type SnapshotFrom, assign, setup } from 'xstate'

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
 * Bounds a frame that never answers. A `frame-src` that refuses it is silent to its parent, so
 * this is also how a host's stale CSP is found. Nothing blocks on it, so a generous bound costs a
 * late answer rather than a slow first paint. 10 seconds was not generous enough: a slow load
 * replaced a working Atlas with the blocked screen about once in 30 loads on an iPhone.
 */
export const HANDSHAKE_TIMEOUT_MS = 20_000

/**
 * One mounted challenge frame, from its first silent moment to a token.
 *
 * - `loading`: mounted, nothing heard. Silence for {@link HANDSHAKE_TIMEOUT_MS} is `blocked`; any
 *   message at all proves the frame alive and leaves this state.
 * - `unsolved`: Turnstile is running and has not asked for anything.
 * - `needsClick`: Cloudflare wants a click, so the frame is shown.
 * - `solved`: holding a token. `shown` while the frame that asked for the click is still on screen,
 *   until `settled` collapses it. `spent` once a submit has taken it: a token is single-use, so a
 *   second submit sent in the same tick finds none to take, and the owner resets after a failure.
 * - `blocked`: errored or silent. ⚠ It must NOT latch: Turnstile's `retry` defaults to `auto`, so a
 *   transient failure is often followed by a retry that solves, and a latched `blocked` would leave
 *   a visitor holding a valid token behind the mailto escape.
 *
 * Only `solved` holds a token, and leaving it drops the token.
 */
export const challengeMachine = setup({
  types: {} as { context: { token: string | null }; events: ChallengeEvent },
  actions: {
    takeToken: assign({ token: ({ event }) => (event.type === 'token' ? event.token : null) }),
    dropToken: assign({ token: null }),
  },
  delays: { handshake: HANDSHAKE_TIMEOUT_MS },
}).createMachine({
  id: 'challenge',
  context: { token: null },
  initial: 'loading',
  on: {
    error: { target: '.blocked' },
    token: { target: '.solved.collapsed', actions: 'takeToken' },
  },
  states: {
    loading: {
      after: { handshake: 'blocked' },
      on: { ready: 'unsolved', expired: 'unsolved', interactive: 'needsClick' },
    },
    unsolved: {
      on: { interactive: 'needsClick' },
    },
    needsClick: {
      on: {
        settled: 'unsolved',
        token: { target: 'solved.shown', actions: 'takeToken' },
        reset: 'unsolved',
      },
    },
    solved: {
      initial: 'collapsed',
      exit: 'dropToken',
      on: { expired: 'unsolved', reset: 'unsolved' },
      states: {
        shown: { on: { settled: 'collapsed', spend: 'spent' } },
        collapsed: { on: { spend: 'spent' } },
        spent: {},
      },
    },
    blocked: {
      // A challenge that errored can still recover by itself, as above.
      on: { ready: 'unsolved', interactive: 'needsClick' },
    },
  },
})

export type ChallengeActor = ActorRefFrom<typeof challengeMachine>
export type ChallengeSnapshot = SnapshotFrom<typeof challengeMachine>

type ChallengeView = {
  status: TurnstileStatus
  /** The solved token — spent or not — or null while unsolved, expired or reset. */
  token: string | null
  /** Cloudflare is waiting on the visitor's click. */
  needsClick: boolean
  /** Whether the frame takes room on the page. */
  frameShown: boolean
}

/** What the forms and the frame read off a snapshot. */
export function challengeView(snapshot: ChallengeSnapshot): ChallengeView {
  const needsClick = snapshot.matches('needsClick')

  return {
    status: snapshot.matches('loading')
      ? 'loading'
      : snapshot.matches('blocked')
        ? 'blocked'
        : 'ready',
    token: snapshot.context.token,
    needsClick,
    frameShown: needsClick || snapshot.matches({ solved: 'shown' }),
  }
}

/** Before a frame mounts, and under SSR. */
export const UNMOUNTED_CHALLENGE: ChallengeView = {
  status: 'loading',
  token: null,
  needsClick: false,
  frameShown: false,
}
