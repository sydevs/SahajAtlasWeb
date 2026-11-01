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

// This renders Cloudflare Turnstile explicitly. See issue #79.
// This code is hand-rolled, instead of adding `@marsidev/react-turnstile`.
// The embedded bundle ships on host pages we do not control, so every added dependency is weight we would rather avoid.
//
// ⚠ **The challenge renders in a frame on OUR origin, never in the host's document. See issue #343.**
// Turnstile validates the hostname of the document that renders it, so the script embed used to present the partner's hostname and fail with `110200`.
// `src/lib/turnstile-frame.ts` owns that reasoning and the message protocol; `challenge.html` is the page.
// Nothing here branches on embed mode: the frame is used standalone and framed alike, so one code path is the only one anybody tests.
//
// ⚠ **The challenge is no longer lazy. That behavior inverted in issue #182.**
// Registration is what this widget is for, and registration cannot happen without a token.
// So a challenge that cannot load is a broken embed, not a form that degrades.
// `useTurnstileGuard` starts the check as soon as the INTERFACE mounts, never the shell. See `FullInterface`.
// It fails the widget when the check cannot complete.
// So a host with an out-of-date CSP finds out from their own page, not from a visitor who could not register.
//
// The frame is still removed on unmount.
// So reopening a form always gets a fresh challenge, not a stale or expired token.

/** Cloudflare's own widget is 300×65. The frame is sized to it, since nothing else is on the page. */
const FRAME_WIDTH = 300
const FRAME_HEIGHT = 65

/**
 * How long the availability check waits for the frame's handshake.
 *
 * It bounds a frame that neither loads nor errors: a CSP refusal reports
 * `securitypolicyviolation` and is caught at once, but a host behind a proxy that swallows the
 * request leaves the frame blank with no event at all. Nothing waits on this promise, so the
 * cost of the bound being generous is a verdict that lands late, not a slow first paint.
 */
const PROBE_TIMEOUT_MS = 10_000

/**
 * Builds the frame and the listener that reads it, for both the hook and the probe.
 *
 * Two checks decide what counts as the frame talking, and both are needed. `event.source`
 * pins the message to this frame's own window, which no other document can forge. `origin`
 * pins it to the origin we built the `src` from, so a frame navigated elsewhere — a redirect,
 * a captive portal — cannot keep answering as the challenge.
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
  // The frame's content is a captcha with its own labelling. A title is still required of
  // every frame, and "security check" is what a screen-reader user needs to hear here.
  frame.title = 'Security check'
  // Cloudflare learns our origin from the request regardless. This keeps the host page's path
  // and query out of it, which an `unsafe-url` referrer policy on the host would otherwise send.
  frame.referrerPolicy = 'strict-origin'

  const expectedOrigin = new URL(src).origin
  const onMessage = (event: MessageEvent) => {
    // `contentWindow` is checked for presence as well as identity: a frame with none yet
    // leaves both sides `null`, and `null !== null` is false, so a message carrying no source
    // would pass an identity test alone.
    if (!frame.contentWindow || event.source !== frame.contentWindow) return
    if (event.origin !== expectedOrigin) return

    onEvent(parseChallengeEvent(event.data))
  }

  window.addEventListener('message', onMessage)

  const dispose = () => {
    window.removeEventListener('message', onMessage)
    frame.remove()
  }

  return { frame, expectedOrigin, dispose }
}

/**
 * This mounts the challenge page hidden, and reports whether Turnstile is live inside it.
 *
 * This is the reading half of the eager check. See issue #182.
 * It answers "can this page run Turnstile at all," a question about the host's CSP and the network, not about any one form.
 * This resolves to `false` rather than rejecting, because every caller treats a failure as a verdict, not an exception.
 *
 * ⚠ **This check is weaker than a real render, and that gap is deliberate, not overlooked.**
 * The frame is mounted in probe mode, so it hands back the handshake without rendering a
 * challenge — a real render here would spend a solve nobody submits, in a frame nobody can see.
 * What it therefore sees: a `frame-src` that refuses our origin, a `script-src` inside our own
 * frame (ours to get right, not a host's), an absent site key, and a script that loads without
 * defining the API.
 * What it cannot see: a challenge that renders and then errors, which `useTurnstile`'s own
 * `blocked` status remains the backstop for.
 * ⚠ The hostname mismatch this check could never see is **gone** rather than unobserved — the
 * challenge now always renders on the one hostname the widget's Turnstile key lists (#343).
 */
export async function probeTurnstile(): Promise<boolean> {
  if (typeof document === 'undefined') return false

  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (available: boolean) => {
      if (settled) return

      settled = true
      clearTimeout(timer)
      document.removeEventListener('securitypolicyviolation', onViolation)
      dispose()
      resolve(available)
    }

    // The violation the probe exists to catch: a host `frame-src` (or `child-src`, or a
    // `default-src` standing in for either) that refuses our origin. The frame then fires no
    // load and no error of its own, so without this the verdict would wait out the timeout.
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

    // Hidden, not `display: none`: a frame with no box is still fetched, but keeping it in the
    // layout tree is what keeps this check as close as possible to the frame a form mounts.
    frame.style.position = 'absolute'
    frame.style.width = '1px'
    frame.style.height = '1px'
    frame.style.opacity = '0'
    frame.style.pointerEvents = 'none'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1

    const timer = setTimeout(() => settle(false), PROBE_TIMEOUT_MS)

    document.addEventListener('securitypolicyviolation', onViolation)
    document.body.appendChild(frame)
  })
}

/**
 * This is `loading` until the challenge renders.
 * This is `blocked` when Turnstile is unavailable: no site key, a CSP-blocked frame, or a widget that errors out.
 * A caller must degrade on `blocked`, rather than leaving a submit button that can never produce a token.
 */
export type TurnstileStatus = 'loading' | 'ready' | 'blocked'

export type UseTurnstileOptions = {
  /** This skips the frame entirely and reports `blocked`, for the Ladle story's degraded case. */
  disabled?: boolean
}

export type UseTurnstile = {
  /** Attach to the element the challenge frame is appended to. */
  challengeRef: RefObject<HTMLDivElement>
  /** This is the solved token, or null while unsolved or expired. */
  token: string | null
  status: TurnstileStatus
  /**
   * This discards the current token and re-runs the challenge in place.
   *
   * **A Turnstile token is single-use.** The server redeems it the moment it verifies, before it does the work the token was gating.
   * So after ANY failed submit, the token in hand may already be spent.
   * Re-sending it would then be refused for the rest of the widget's life.
   * A caller whose submit failed must reset, rather than offer a retry that cannot succeed.
   *
   * This is a no-op while the challenge is not rendered, blocked or still loading.
   * So a caller never has to check `status` first.
   */
  reset: () => void
}

export function useTurnstile({ disabled = false }: UseTurnstileOptions = {}): UseTurnstile {
  const challengeRef = useRef<HTMLDivElement>(null)
  // This is held in a ref as well as the effect closure.
  // So `reset` can reach the live frame without re-running, and so re-mounting, the challenge.
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(disabled ? 'blocked' : 'loading')
  const { theme } = useTheme()
  const { languageCode } = useLocale()

  // Re-mounting on a theme or language change is deliberate.
  // Turnstile bakes both into the widget at render time, so the frame carries them in its URL.
  // So the challenge tears down and re-mounts, which also drops the token correctly, since the new widget has not been solved.
  useEffect(() => {
    if (disabled || !challengeRef.current) return

    setToken(null)
    setStatus('loading')

    const { frame, dispose } = createChallengeFrame(
      { theme, language: languageCode },
      (message) => {
        switch (message?.type) {
          case 'ready':
            setStatus('ready')
            break
          // Turnstile's `retry` option defaults to `auto`.
          // So a transient failure is often followed by an automatic retry that solves.
          // So `blocked` must NOT be a one-way latch.
          // A solved challenge has to win the form back.
          // Otherwise the user holds a valid token while the UI still offers only the mailto escape.
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

    frameRef.current = frame
    challengeRef.current.appendChild(frame)

    return () => {
      dispose()
      frameRef.current = null
    }
  }, [disabled, theme, languageCode])

  // This is stable across renders, with no dependencies.
  // The caller passes this straight to `useMutation`'s `onError`.
  // A fresh identity on each render would re-run the observer's `setOptions` for nothing.
  // `reset` re-runs the challenge, which sends the same `token` message on success.
  // So the new token arrives through the normal path.
  const reset = useCallback(() => {
    const frame = frameRef.current

    if (!frame?.contentWindow) return

    setToken(null)
    frame.contentWindow.postMessage(challengeMessage({ type: 'reset' }), '*')
  }, [])

  return { challengeRef, token, status, reset }
}
