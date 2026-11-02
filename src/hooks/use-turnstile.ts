import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import {
  type ChallengeEvent,
  type ChallengeOptions,
  challengeMessage,
  challengeSrc,
  parseChallengeEvent,
} from '@/lib/turnstile-frame'
import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'

// Turnstile rendered explicitly, hand-rolled rather than through `@marsidev/react-turnstile`
// (#79): this bundle ships on host pages we do not control, so a dependency is weight.
//
// ⚠ **The challenge renders in a frame on OUR origin, never in the host's document (#343).**
// `src/lib/turnstile-frame.ts` owns that reasoning and the protocol; `challenge.html` is the
// page. Nothing here branches on embed mode, so one code path is the only one anybody tests.
//
// ⚠ **The challenge is not lazy — that inverted in #182.** Registration cannot happen without a
// token, so a challenge that cannot load fails the widget rather than degrading the form, as
// soon as the INTERFACE mounts (`useTurnstileGuard`). A host with a stale CSP hears it from
// their own page, not from a visitor who could not register.

/** Cloudflare's own widget is 300×65. The frame is sized to it, since nothing else is on the page. */
const FRAME_WIDTH = 300
const FRAME_HEIGHT = 65

/**
 * Bounds a frame that neither loads nor errors — a proxy that swallows the request, a refusal on
 * an engine that reports no violation. Nothing blocks on the verdict, so a generous bound costs
 * a late answer rather than a slow first paint.
 */
const HANDSHAKE_TIMEOUT_MS = 10_000

/**
 * Read off Turnstile's own `api.js` on 2026-11-02: what it sets on the widget frame it renders
 * inside our page.
 *
 * ⚠ **Every policy-controlled feature is denied to a cross-origin child by default**, so without
 * this the frame is silently less capable than the script embed it replaces, which ran `api.js`
 * in the HOST's document. Permissions Policy is hierarchical, so it grants nothing we lack.
 *
 * ⚠ **Private State Tokens cannot be delegated from here.** `api.js` asks for them as
 * `private-token`, gated on `document.featurePolicy.features()`, which in Chromium 153 lists
 * `private-state-token-issuance` and `private-state-token-redemption` instead — so the pair a
 * parent can delegate reaches nothing. `docs/embedding.md` § Permissions Policy has the
 * host-facing half.
 */
const TURNSTILE_FEATURES =
  'cross-origin-isolated; fullscreen; autoplay; keyboard-map; gamepad; xr-spatial-tracking'

/**
 * The frame, its listener, and the one definition of its liveness — for both the hook and the
 * probe.
 *
 * `event.source` pins a message to this frame's own window, which no other document can forge;
 * `origin` pins it to the origin the `src` was built from, so a frame navigated elsewhere cannot
 * keep answering as the challenge.
 *
 * ⚠ **Silence is delivered as the page's own `error`**, since a frame that never handshakes is as
 * dead as one that failed, and both callers answer `error` already — the probe `false`, the hook
 * `blocked`. No timeout here is what left a form under a refusing `frame-src` on `loading` for
 * ever.
 */
function createChallengeFrame(
  options: ChallengeOptions,
  onEvent: (message: ChallengeEvent | null) => void,
) {
  const frame = document.createElement('iframe')
  const src = challengeSrc(import.meta.url, options)

  frame.src = src
  frame.width = String(FRAME_WIDTH)
  frame.height = String(FRAME_HEIGHT)
  frame.style.border = '0'
  // A captcha labels itself, but every frame still needs a title, and this is what a
  // screen-reader user needs to hear.
  frame.title = 'Security check'
  // This hop goes to OUR origin, not Cloudflare's (`src/challenge.ts` owns that one), so what
  // this withholds is the host page's path and query from our own logs.
  frame.referrerPolicy = 'strict-origin'
  frame.allow = TURNSTILE_FEATURES

  const expectedOrigin = new URL(src).origin
  const onMessage = (event: MessageEvent) => {
    // `contentWindow` is checked for presence as well as identity: a frame with none yet leaves
    // both sides `null`, so a message carrying no source would pass an identity test alone.
    if (!frame.contentWindow || event.source !== frame.contentWindow) return
    if (event.origin !== expectedOrigin) return

    const message = parseChallengeEvent(event.data)

    if (message) clearTimeout(timer)

    onEvent(message)
  }
  const timer = setTimeout(() => onEvent({ type: 'error' }), HANDSHAKE_TIMEOUT_MS)

  window.addEventListener('message', onMessage)

  const dispose = () => {
    clearTimeout(timer)
    window.removeEventListener('message', onMessage)
    frame.remove()
  }

  return { frame, expectedOrigin, dispose }
}

/** Shared by every mount on the page. Cleared on a negative verdict, so a blip is retried. */
let availability: Promise<boolean> | null = null

/**
 * Whether Turnstile can run on this page at all — the host's CSP and the network, not any one
 * form (#182). Resolves `false` rather than rejecting, because every caller wants a verdict.
 *
 * Memoized because the script load this replaced memoized itself: without it a compact embed's
 * open/close/open pays for a browsing context, three of our chunks and a script eval each time.
 *
 * ⚠ **Weaker than a real render, deliberately.** Probe mode hands back the handshake without
 * rendering, so it sees a `frame-src` that refuses us, a `script-src` inside our own frame, an
 * absent site key and a script that loads without defining the API — but not a challenge that
 * renders and then errors, which `useTurnstile`'s `blocked` backstops.
 * ⚠ The hostname mismatch it could never see is **gone** rather than unobserved: the challenge
 * now always renders on the one hostname the widget's Turnstile key lists (#343).
 */
export async function probeTurnstile(): Promise<boolean> {
  if (typeof document === 'undefined') return false

  availability ??= runCheck().then((available) => {
    if (!available) availability = null

    return available
  })

  return availability
}

function runCheck(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (available: boolean) => {
      if (settled) return

      settled = true
      document.removeEventListener('securitypolicyviolation', onViolation)
      dispose()
      resolve(available)
    }

    // A host refusing to frame our origin fires no load and no error, so this answers before the
    // handshake timeout — a latency decision, not a second liveness rule.
    //
    // Measured in Chromium 153.0.8010.12 against the built page, 2026-11-01: `frame-src 'none'`
    // and a bare `default-src 'self'` both report `effectiveDirective: 'frame-src'` with
    // `blockedURI` the BARE ORIGIN, no trailing slash and no path — hence `startsWith`.
    // `child-src`, `default-src` and `violatedDirective` cover the engines and spellings this
    // was not measured on.
    const onViolation = (event: SecurityPolicyViolationEvent) => {
      const directive = event.effectiveDirective || event.violatedDirective

      if (!/^(frame|child|default)-src$/.test(directive)) return
      if (!event.blockedURI.startsWith(expectedOrigin)) return

      settle(false)
    }

    const { frame, expectedOrigin, dispose } = createChallengeFrame(
      { theme: 'auto', language: 'auto', probe: true },
      (message) => {
        if (message?.type === 'ready') settle(true)
        if (message?.type === 'error') settle(false)
      },
    )

    // Hidden rather than `display: none`, which would still fetch but leave the layout tree —
    // this keeps the check as close as possible to the frame a form mounts.
    //
    // ⚠ `fixed`, not `absolute`. This lands in the HOST page's body, where an out-of-flow element
    // at its static position still extends the document's scroll area. A fixed one contributes
    // no scroll to somebody else's page.
    frame.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1

    document.addEventListener('securitypolicyviolation', onViolation)
    document.body.appendChild(frame)
  })
}

/**
 * `loading` until the challenge renders, `blocked` when Turnstile is unavailable: no site key, a
 * CSP-blocked frame, or a widget that errors out. A caller must degrade on `blocked` rather than
 * leave a submit button that can never produce a token.
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
  // In a ref as well as the effect closure, so `reset` reaches the live frame without re-running
  // the effect. The origin rides along so `reset` addresses the frame as narrowly as the inbound
  // filter reads it: a frame navigated elsewhere receives nothing rather than a command.
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

    const { frame, expectedOrigin, dispose } = createChallengeFrame(
      { theme, language: languageCode },
      (message) => {
        switch (message?.type) {
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

    frameRef.current = { frame, origin: expectedOrigin }
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
    live.frame.contentWindow.postMessage(challengeMessage({ type: 'reset' }), live.origin)
  }, [])

  return { challengeRef, token, status, reset }
}
