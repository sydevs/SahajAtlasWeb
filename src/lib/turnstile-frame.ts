/**
 * The contract between the widget and the Turnstile challenge page it frames (#343).
 *
 * **Turnstile validates the hostname of the document that RENDERS it, not the top-level page.**
 * The script embed put our React tree in the HOST's document, so every partner hostname off the
 * widget's Turnstile list failed with `110200` — measured, including in a nested frame on the
 * same host, where it passed. On our own origin, one hostname list covers every partner and a
 * host configures nothing.
 *
 * Pure, and shared by both sides: `src/challenge.ts` is the page, `src/hooks/use-turnstile.ts`
 * frames it. One module rather than two copies, because a protocol that drifts fails silently —
 * the parent waits for a handshake the page stopped sending, with nothing on the console.
 */

/** The challenge page's own path. A Vite HTML input, so it lands at the output root. */
export const CHALLENGE_PATH = '/challenge.html'

/**
 * Namespaces every message in both directions. The traffic lands on a window the HOST page also
 * owns, and a host may run its own cross-frame messaging — without the marker a message shaped
 * like `{ type: 'token' }` from a chat widget or an analytics bridge would read as a solve.
 */
export const CHALLENGE_CHANNEL = 'sahaj-atlas-turnstile'

/** What the page tells its parent. `ready` is the handshake: Turnstile is live on our origin. */
export type ChallengeEvent =
  | { type: 'ready' }
  | { type: 'token'; token: string }
  | { type: 'expired' }
  | { type: 'error' }

/** What the parent tells the page. */
export type ChallengeCommand = { type: 'reset' }

export type ChallengeOptions = {
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

/**
 * Resolved against the calling module's own URL, so the frame is same-origin with the bundle in
 * production, a Workers preview, `pnpm dev` and Ladle alike. `src/styles/fonts.ts` resolves font
 * files the same way: the deploy origin is not knowable at build time.
 *
 * ⚠ `moduleUrl` is a parameter rather than an `import.meta.url` read here. Vite rewrites the
 * literal `new URL(…, import.meta.url)` expression as its asset-URL idiom and leaves a variable
 * base alone — and a parameter is what lets a spec assert what a real deploy returns.
 */
const challengeUrl = (moduleUrl: string): URL => new URL(CHALLENGE_PATH, moduleUrl)

/** The frame's `src`, carrying what Turnstile bakes into the widget at render time. */
export function challengeSrc(moduleUrl: string, options: ChallengeOptions): string {
  const url = challengeUrl(moduleUrl)

  url.searchParams.set('theme', options.theme)
  url.searchParams.set('language', options.language)
  if (options.probe) url.searchParams.set('probe', '1')

  return url.href
}

/** The origin the frame is served from — the one a host must allow under `frame-src`. */
export const challengeOrigin = (moduleUrl: string): string => challengeUrl(moduleUrl).origin

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
    case 'error':
      return { type: message.type }
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

/** The parent's command, or `null`. Read by the page, where every framer is untrusted. */
export function parseChallengeCommand(data: unknown): ChallengeCommand | null {
  return onChannel(data)?.type === 'reset' ? { type: 'reset' } : null
}

/** Wraps an outgoing message. Both sides send through this, so the channel cannot be forgotten. */
export function challengeMessage<T extends ChallengeEvent | ChallengeCommand>(message: T) {
  return { channel: CHALLENGE_CHANNEL, ...message }
}

/**
 * The page's own query string, read back. Unknown values fall back rather than refusing: they
 * reach us from a URL the parent built, and a captcha that will not render is a worse answer
 * than one rendered in the wrong theme.
 */
export function readChallengeOptions(search: string): ChallengeOptions {
  const params = new URLSearchParams(search)
  const theme = params.get('theme')
  const language = params.get('language') ?? ''

  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'auto' ? theme : 'auto',
    // Turnstile takes `auto` for "follow the browser", which is the right default here too.
    language: /^[a-z]{2}(-[a-z]{2})?$/i.test(language) ? language : 'auto',
    probe: params.get('probe') === '1',
  }
}
