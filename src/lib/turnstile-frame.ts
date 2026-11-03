/**
 * The contract between the widget and the Turnstile challenge page it frames (#343).
 *
 * **Turnstile validates the hostname of the document that RENDERS it, not the top-level page.**
 * The script embed put our React tree in the HOST's document, so every partner hostname off the
 * key's Turnstile list failed with `110200` — measured, including in a nested frame on the same
 * host, where it passed. In a page on one origin of ours, one hostname covers every partner.
 *
 * ⚠ **Cross-repo contract.** The page is SahajCloud's `GET /api/atlas/challenge`
 * (sydevs/SahajCloud#1072, `src/endpoints/atlas/challenge/challengeDocument.ts` there), which holds
 * both halves of the Turnstile key and decides which parents may receive a token. Change the
 * channel, a message `type`, a `reason` or a query parameter in both repos in the same release: a
 * drifted protocol fails silently, the frame waiting out its handshake with nothing on the console.
 */

/** The page's path on the SahajCloud origin. */
export const CHALLENGE_PATH = '/api/atlas/challenge'

/**
 * Namespaces every message in both directions. The traffic lands on a window the HOST page also
 * owns, and a host may run its own cross-frame messaging — without the marker a message shaped
 * like `{ type: 'token' }` from a chat widget or an analytics bridge would read as a solve.
 */
export const CHALLENGE_CHANNEL = 'sahaj-atlas-turnstile'

/**
 * Why the page rendered no challenge. `origin`: SahajCloud does not allow the parent — the host's
 * domain is in no client record's allowed domains. `unavailable`: SahajCloud has no site key.
 */
export type ChallengeRefusal = 'origin' | 'unavailable'

/** What the page tells its parent. `ready` is the handshake: Turnstile is live in the frame. */
export type ChallengeEvent =
  | { type: 'ready' }
  | { type: 'token'; token: string }
  | { type: 'expired' }
  | { type: 'error'; reason?: ChallengeRefusal }

/** What the parent tells the page. */
export type ChallengeCommand = { type: 'reset' }

export type ChallengeOptions = {
  /**
   * The origin of the document the frame is appended to — `location.origin`, the host's in a
   * script embed and ours in an iframe embed. The page talks to that origin and no other, so the
   * browser refuses its token to any other parent.
   */
  parent: string
  theme: 'light' | 'dark' | 'auto'
  /** Turnstile's own `language` option — a two-letter code, as the widget's locale gives it. */
  language: string
  /**
   * Hand back `ready` and render nothing. The eager check asks only whether Turnstile can run
   * here, which the handshake answers; a render would spend a solve nobody submits, against the
   * account's quota, in a frame the viewer cannot see.
   */
  probe?: boolean
}

/** The frame's `src` on the SahajCloud origin, carrying what the page renders with. */
export function challengeSrc(serverUrl: string, options: ChallengeOptions): string {
  const url = new URL(CHALLENGE_PATH, serverUrl)

  url.searchParams.set('parent', options.parent)
  url.searchParams.set('theme', options.theme)
  url.searchParams.set('language', options.language)
  if (options.probe) url.searchParams.set('probe', '1')

  return url.href
}

/** The envelope both parsers read: an object on our channel, or `null` for anything else. */
const onChannel = (data: unknown): Record<string, unknown> | null =>
  typeof data === 'object' &&
  data !== null &&
  'channel' in data &&
  data.channel === CHALLENGE_CHANNEL
    ? (data as Record<string, unknown>)
    : null

/** The page's message, or `null` for anything else on the window. */
export function parseChallengeEvent(data: unknown): ChallengeEvent | null {
  const message = onChannel(data)

  if (!message) return null

  switch (message.type) {
    case 'ready':
    case 'expired':
      return { type: message.type }
    case 'error':
      // An unknown reason is still an error: a newer page must not make an older widget hang.
      return message.reason === 'origin' || message.reason === 'unavailable'
        ? { type: 'error', reason: message.reason }
        : { type: 'error' }
    case 'token':
      // An empty token would enable Submit and then fail verification, which reads to a visitor
      // as the form being broken rather than the challenge.
      return typeof message.token === 'string' && message.token !== ''
        ? { type: 'token', token: message.token }
        : null
    default:
      return null
  }
}

/** Wraps an outgoing message, so the channel cannot be forgotten. */
export function challengeMessage<T extends ChallengeEvent | ChallengeCommand>(message: T) {
  return { channel: CHALLENGE_CHANNEL, ...message }
}
