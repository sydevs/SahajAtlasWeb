/**
 * The contract between the widget and the Turnstile challenge page it frames (#343).
 *
 * **Turnstile validates the hostname of the document that RENDERS it, not the top-level page.**
 * The script embed puts our React tree inside the HOST's document, so the challenge used to
 * render on the partner's hostname and every one not on the widget's Turnstile hostname list
 * failed with `110200` — measured directly, and in a nested frame on the same host, where it
 * passed. One hostname list covers every partner once the challenge renders on our origin, so
 * there is no per-partner onboarding step and nothing for a host to configure.
 *
 * Pure, and shared by both sides of the frame: `src/challenge.ts` is the page, and
 * `src/hooks/use-turnstile.ts` frames it. One module rather than two copies, because a
 * protocol that drifts fails silently — the parent waits for a handshake the page stopped
 * sending, and the form stays disabled with nothing on the console.
 */

/** The challenge page's own path. A Vite HTML input, so it lands at the output root. */
export const CHALLENGE_PATH = '/challenge.html'

/**
 * Namespaces every message in both directions.
 *
 * The frame's `postMessage` traffic lands on a window the HOST page also owns, and a host may
 * run its own cross-frame messaging, a chat widget or an analytics bridge. Without a channel
 * marker a message shaped like `{ type: 'token' }` from any of those would read as a solved
 * challenge.
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
   * Hand back `ready` and render nothing.
   *
   * The eager availability check asks whether Turnstile can run here at all, which the
   * handshake answers on its own. Rendering for it would solve a challenge nobody submits,
   * against the account's own quota, in a frame the viewer cannot see.
   */
  probe?: boolean
}

/**
 * The frame's `src`, resolved against the calling module's own URL so the frame is always
 * same-origin with the bundle — production, a Workers preview, `pnpm dev` or Ladle, with
 * nothing to configure. `src/styles/fonts.ts` resolves the font files the same way and for the
 * same reason: the deploy origin is not knowable at build time.
 *
 * ⚠ `moduleUrl` is a parameter rather than a `import.meta.url` read inside this module, for
 * two reasons. Vite rewrites the literal `new URL(…, import.meta.url)` expression at transform
 * time as its asset-URL idiom, and a variable base is left alone. And it is what lets a spec
 * assert the shape this returns on a real deploy, rather than on the test runner's own origin.
 */
export function challengeSrc(moduleUrl: string, options: ChallengeOptions): string {
  const url = new URL(CHALLENGE_PATH, moduleUrl)

  url.searchParams.set('theme', options.theme)
  url.searchParams.set('language', options.language)
  if (options.probe) url.searchParams.set('probe', '1')

  return url.href
}

/** The origin the frame is served from — the one a host must allow under `frame-src`. */
export function challengeOrigin(moduleUrl: string): string {
  return new URL(CHALLENGE_PATH, moduleUrl).origin
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const onChannel = (data: unknown): Record<string, unknown> | null =>
  isRecord(data) && data.channel === CHALLENGE_CHANNEL ? data : null

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
      // An empty token would enable Submit and then fail verification, which reads to a
      // visitor as the form being broken rather than the challenge.
      return typeof message.token === 'string' && message.token !== ''
        ? { type: 'token', token: message.token }
        : null
    default:
      return null
  }
}

/** The parent's command, or `null`. Read by the page, where every framer is untrusted. */
export function parseChallengeCommand(data: unknown): ChallengeCommand | null {
  const message = onChannel(data)

  return message?.type === 'reset' ? { type: 'reset' } : null
}

/** Wraps an outgoing message. Both sides send through this, so the channel cannot be forgotten. */
export function challengeMessage<T extends ChallengeEvent | ChallengeCommand>(message: T) {
  return { channel: CHALLENGE_CHANNEL, ...message }
}

/**
 * The page's own query string, read back.
 *
 * Unknown values fall back rather than refusing: these reach us from a URL the parent built,
 * and a captcha that will not render is a worse answer than one rendered in the wrong theme.
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
