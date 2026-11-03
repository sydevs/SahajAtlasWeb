import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'

// Turnstile rendered explicitly, hand-rolled rather than through `@marsidev/react-turnstile`
// (#79): this bundle ships on host pages we do not control, so a dependency is weight.
//
// ⚠ **The challenge renders in a frame SahajCloud serves, never in the host's document (#343,
// sydevs/SahajCloud#1072).** Turnstile validates the hostname of the document that renders it, so
// one SahajCloud hostname covers every partner. SahajCloud holds both halves of the key and decides
// which parents may receive a token; this file only frames the page and listens to it.
//
// ⚠ **Cross-repo contract** with SahajCloud's `src/endpoints/atlas/challenge/`: the path, the query
// parameters, the channel, each message `type` and the `origin` reason. Change them in both repos
// in the same release — a drifted protocol fails silently, the frame waiting out its handshake.
//
// ⚠ **The challenge is not lazy — that inverted in #182.** Registration cannot happen without a
// token, so a challenge that cannot load fails the widget as soon as the INTERFACE mounts
// (`useTurnstileGuard`), and a host with a stale CSP hears it from their own page.

const CHALLENGE_PATH = '/api/atlas/challenge'

/**
 * Stamped on every message, both ways. `source` and `origin` pin a message to SahajCloud's page,
 * but that page also runs Cloudflare's `api.js`, so they cannot tell this protocol from anything
 * else its scripts post.
 */
const CHALLENGE_CHANNEL = 'sahaj-atlas-turnstile'

/** `ready` is the handshake: Turnstile is live in the frame. */
type ChallengeEvent =
  | { type: 'ready' }
  | { type: 'expired' }
  | { type: 'token'; token: string }
  /** `origin`: SahajCloud refused this page's origin — no client record lists its domain. */
  | { type: 'error'; reason?: 'origin' }

function readChallengeEvent(data: unknown): ChallengeEvent | null {
  if (typeof data !== 'object' || data === null) return null

  const { channel, type, token, reason } = data as Record<string, unknown>

  if (channel !== CHALLENGE_CHANNEL) return null
  if (type === 'ready' || type === 'expired') return { type }
  // Any other reason is still an error: a newer page must not leave this widget waiting.
  if (type === 'error') return reason === 'origin' ? { type, reason } : { type }
  // An empty token would enable Submit and then fail verification, which reads to a visitor as
  // the form being broken rather than the challenge.
  if (type === 'token' && typeof token === 'string' && token !== '') return { type, token }

  return null
}

/** Cloudflare's own widget is 300×65, and nothing else is on the page. */
const FRAME_WIDTH = 300
const FRAME_HEIGHT = 65

/**
 * Bounds a frame that never answers. A `frame-src` that refuses it is silent to its parent, so
 * this is also how a host's stale CSP is found. Nothing blocks on it, so a generous bound costs a
 * late answer rather than a slow first paint.
 */
const HANDSHAKE_TIMEOUT_MS = 10_000

/**
 * Read off Turnstile's own `api.js` on 2026-11-02: what it sets on the widget frame it renders.
 *
 * ⚠ **Every policy-controlled feature is denied to a cross-origin child by default**, so without
 * this the challenge is less capable than when `api.js` ran in the host's document. Permissions
 * Policy is hierarchical, so it grants nothing the host did not.
 *
 * ⚠ **Private State Tokens cannot be delegated from here.** `api.js` asks for `private-token`,
 * gated on `document.featurePolicy.features()`, which in Chromium 153 lists only
 * `private-state-token-issuance` and `-redemption` — so the pair a parent can delegate reaches
 * nothing. `docs/embedding.md` § Permissions Policy has the host-facing half.
 */
const TURNSTILE_FEATURES =
  'cross-origin-isolated; fullscreen; autoplay; keyboard-map; gamepad; xr-spatial-tracking'

type FrameOptions = { theme: 'light' | 'dark' | 'auto'; language: string; probe?: boolean }

/**
 * The frame, its listener, and the one definition of its liveness, for both the hook and the
 * probe. `event.source` pins a message to this frame's window, which no other document can forge;
 * `origin` pins it to SahajCloud, so a frame navigated elsewhere cannot answer as the challenge.
 *
 * ⚠ **Silence is delivered as the page's own `error`**: a frame that never handshakes is as dead
 * as one that failed, and both callers already answer `error`.
 */
function createChallengeFrame(
  { theme, language, probe = false }: FrameOptions,
  onEvent: (message: ChallengeEvent) => void,
) {
  const url = new URL(CHALLENGE_PATH, import.meta.env.VITE_SAHAJCLOUD_URL)

  // The page posts to this origin and no other, so it must be the document the frame is appended
  // to — the host's in a script embed, ours in an iframe embed.
  url.searchParams.set('parent', window.location.origin)
  url.searchParams.set('theme', theme)
  url.searchParams.set('language', language)
  // Handshake only: a hidden render would spend a solve nobody submits.
  if (probe) url.searchParams.set('probe', '1')

  const frame = document.createElement('iframe')

  frame.src = url.href
  frame.width = String(FRAME_WIDTH)
  frame.height = String(FRAME_HEIGHT)
  frame.style.border = '0'
  frame.title = 'Security check'
  // SahajCloud reads the parent from the URL, so this withholds only the host page's path and query.
  frame.referrerPolicy = 'strict-origin'
  frame.allow = TURNSTILE_FEATURES

  const onMessage = (event: MessageEvent) => {
    // Presence as well as identity: before the frame has a window both sides are `null`, and a
    // message carrying no source would pass an identity test alone.
    if (!frame.contentWindow || event.source !== frame.contentWindow) return
    if (event.origin !== url.origin) return

    const message = readChallengeEvent(event.data)

    if (!message) return

    clearTimeout(timer)
    onEvent(message)
  }
  const timer = setTimeout(() => onEvent({ type: 'error' }), HANDSHAKE_TIMEOUT_MS)

  window.addEventListener('message', onMessage)

  const dispose = () => {
    clearTimeout(timer)
    window.removeEventListener('message', onMessage)
    frame.remove()
  }

  return { frame, origin: url.origin, dispose }
}

/**
 * `origin`: SahajCloud refused this page's origin. `failed`: anything else — a page that errored,
 * an absent site key, or a frame refused by the host's CSP, which is silent until the timeout.
 */
export type TurnstileVerdict = 'available' | 'origin' | 'failed'

/** Shared by every mount on the page. Cleared on a negative verdict, so a blip is retried. */
let availability: Promise<TurnstileVerdict> | null = null

/**
 * Whether Turnstile can run on this page at all — the host's CSP, SahajCloud's allowlist and the
 * network, not any one form (#182). Resolves rather than rejecting: every caller wants a verdict.
 * Memoized, so a compact embed's open/close/open does not pay for a browsing context each time.
 *
 * ⚠ **Weaker than a real render, deliberately.** The probe hands back the handshake without
 * rendering, so it sees whatever stops the page loading Turnstile, but not a challenge that
 * renders and then errors — `useTurnstile`'s `blocked` backstops that.
 * ⚠ The hostname mismatch it could never see is **gone** rather than unobserved: the challenge
 * always renders on the one hostname the Turnstile key lists, SahajCloud's (#343).
 */
export async function probeTurnstile(): Promise<TurnstileVerdict> {
  if (typeof document === 'undefined') return 'failed'

  availability ??= new Promise<TurnstileVerdict>((resolve) => {
    const { frame, dispose } = createChallengeFrame(
      { theme: 'auto', language: 'auto', probe: true },
      (message) => {
        if (message.type !== 'ready' && message.type !== 'error') return

        dispose()
        resolve(message.type === 'ready' ? 'available' : (message.reason ?? 'failed'))
      },
    )

    // ⚠ `fixed`, not `absolute`: this lands in the HOST page's body, where an out-of-flow element
    // at its static position still extends the scroll area. Hidden rather than `display: none`,
    // to keep the check as close as possible to the frame a form mounts.
    frame.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    document.body.appendChild(frame)
  }).then((verdict) => {
    if (verdict !== 'available') availability = null

    return verdict
  })

  return availability
}

/**
 * `loading` until the challenge renders, `blocked` when Turnstile is unavailable. A caller must
 * degrade on `blocked` rather than leave a submit button that can never produce a token.
 */
export type TurnstileStatus = 'loading' | 'ready' | 'blocked'

export type UseTurnstileOptions = {
  /** Skips the frame entirely and reports `blocked`, for the Ladle story's degraded case. */
  disabled?: boolean
}

export type UseTurnstile = {
  /** Attach to the element the challenge frame is appended to. */
  challengeRef: RefObject<HTMLDivElement>
  /** The solved token, or null while unsolved or expired. */
  token: string | null
  status: TurnstileStatus
  /**
   * Discards the token and re-runs the challenge in place. A no-op while it is not rendered, so
   * a caller never has to check `status` first.
   *
   * **A Turnstile token is single-use**, redeemed the moment the server verifies it and before
   * the work it gated. So after ANY failed submit the token in hand may be spent, and re-sending
   * it is refused for the rest of the widget's life: a caller whose submit failed must reset
   * rather than offer a retry that cannot succeed.
   */
  reset: () => void
}

export function useTurnstile({ disabled = false }: UseTurnstileOptions = {}): UseTurnstile {
  const challengeRef = useRef<HTMLDivElement>(null)
  // A ref as well as the effect closure, so `reset` reaches the live frame without re-running the
  // effect. The origin rides along so a frame navigated elsewhere receives no command.
  const frameRef = useRef<{ frame: HTMLIFrameElement; origin: string } | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(disabled ? 'blocked' : 'loading')
  const { theme } = useTheme()
  const { languageCode } = useLocale()

  // Re-mounting on a theme or language change is deliberate: Turnstile bakes both in at render
  // time, so the frame carries them in its URL and the teardown drops the unsolved token with it.
  useEffect(() => {
    if (disabled || !challengeRef.current) return

    setToken(null)
    setStatus('loading')

    const { frame, origin, dispose } = createChallengeFrame(
      { theme, language: languageCode },
      (message) => {
        switch (message.type) {
          case 'ready':
            setStatus('ready')
            break
          // Turnstile's `retry` defaults to `auto`, so a transient failure is often followed by a
          // retry that solves. `blocked` must NOT latch, or the user holds a valid token while
          // the UI still offers only the mailto escape.
          case 'token':
            setToken(message.token)
            setStatus('ready')
            break
          case 'expired':
            setToken(null)
            break
          case 'error':
            setToken(null)
            setStatus('blocked')
            break
        }
      },
    )

    frameRef.current = { frame, origin }
    challengeRef.current.appendChild(frame)

    return () => {
      dispose()
      frameRef.current = null
    }
  }, [disabled, theme, languageCode])

  // Stable with no dependencies: the caller hands this to `useMutation`'s `onError`, and a fresh
  // identity each render would re-run the observer's `setOptions` for nothing. The new token
  // arrives through the normal path, since the re-run challenge sends `token` on success.
  const reset = useCallback(() => {
    const live = frameRef.current

    if (!live?.frame.contentWindow) return

    setToken(null)
    live.frame.contentWindow.postMessage({ channel: CHALLENGE_CHANNEL, type: 'reset' }, live.origin)
  }, [])

  return { challengeRef, token, status, reset }
}
