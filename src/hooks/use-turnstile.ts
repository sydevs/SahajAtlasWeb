import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'

// This renders Cloudflare Turnstile explicitly. See issue #79.
// This code is hand-rolled, instead of adding `@marsidev/react-turnstile`.
// Turnstile is a script tag and one render call.
// The embedded bundle ships on host pages we do not control, so every added dependency is weight we would rather avoid.
//
// ⚠ **The script is no longer lazy. That behavior inverted in issue #182.**
// Registration is what this widget is for, and registration cannot happen without a token.
// So a challenge that cannot load is a broken embed, not a form that degrades.
// `useTurnstileProbe` starts the load as soon as the INTERFACE mounts, never the shell. See `FullInterface`.
// It fails the widget when the load cannot complete.
// So a host with an out-of-date CSP finds out from their own page, not from a visitor who could not register.
//
// The widget is still removed on unmount.
// So reopening a form always gets a fresh challenge, not a stale or expired token.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// A Turnstile SITE key is public by design. The secret half lives in SahajCloud.
// So the site key belongs in the committed `.env` file.
// An absent key means the captcha cannot render, the same blocked state as a CSP-refused script.
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY

type TurnstileRenderOptions = {
  sitekey: string
  theme?: 'light' | 'dark' | 'auto'
  language?: string
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
}

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | undefined
  remove: (widgetId: string) => void
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

// This is one in-flight load, shared by every caller.
// This clears on failure, so a later open retries instead of caching a transient network error forever.
let scriptPromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')

    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    // Cloudflare learns the embedding hostname regardless. That is how the domain check works.
    // But a host page that opts into `unsafe-url` referrers would otherwise leak its full path and query on this request too.
    // This sends the origin only.
    script.referrerPolicy = 'strict-origin'
    script.onload = () => resolve()
    // This fires when a host page's CSP omits `challenges.cloudflare.com` from `script-src`.
    // It also fires on an ordinary network failure.
    script.onerror = () => {
      // This drops the dead tag.
      // `scriptPromise` clears below, so every reopen retries.
      // Without this, a host page whose CSP blocks Cloudflare would pile up an orphaned `<script>` tag, and a blocked request, in their `<head>` each time.
      script.remove()
      reject(new Error('Turnstile script could not be loaded'))
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    scriptPromise = null
    throw error
  })

  return scriptPromise
}

/**
 * This loads the Turnstile script without rendering a challenge, and reports whether the API arrived.
 *
 * This is the reading half of the eager check. See issue #182.
 * It answers "can this page run Turnstile at all," a question about the host's CSP and the network, not about any one form.
 * This resolves to `false` rather than rejecting, because every caller treats a failure as a verdict, not an exception.
 *
 * ⚠ **This check is strictly weaker than a real render, and that gap is deliberate, not overlooked.**
 * Three failures are visible from here: no site key, a `script-src` that refuses `challenges.cloudflare.com`,
 * and a script that loads without defining the API, such as a content blocker or an enterprise proxy answering 200 with a stub.
 * Two failures are not visible from here: a `frame-src` that blocks the challenge iframe, and a sitekey the embedding domain is not registered for.
 * Both of those surface only when `turnstile.render` actually runs.
 * So this check is the early warning, and `useTurnstile`'s own `blocked` status remains the backstop.
 * Neither replaces the other.
 */
export async function probeTurnstile(): Promise<boolean> {
  if (!SITE_KEY) return false

  try {
    await loadTurnstile()

    return Boolean(window.turnstile)
  } catch {
    return false
  }
}

/**
 * This is `loading` until the challenge renders.
 * This is `blocked` when Turnstile is unavailable: no site key, a CSP-blocked script, or a widget that errors out, such as when `frame-src` blocks the challenge iframe.
 * A caller must degrade on `blocked`, rather than leaving a submit button that can never produce a token.
 */
export type TurnstileStatus = 'loading' | 'ready' | 'blocked'

export type UseTurnstileOptions = {
  /** This skips loading entirely and reports `blocked`, for the Ladle story's degraded case. */
  disabled?: boolean
}

export type UseTurnstile = {
  /** Attach to the element the challenge renders into. */
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
  // So `reset` can reach the live widget without re-running, and so re-rendering, the challenge.
  const widgetIdRef = useRef<string | undefined>(undefined)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(
    disabled || !SITE_KEY ? 'blocked' : 'loading',
  )
  const { theme } = useTheme()
  const { languageCode } = useLocale()

  // Re-rendering on a theme or language change is deliberate.
  // Turnstile bakes both into the widget at render time.
  // So the challenge tears down and re-renders, which also drops the token correctly, since the new widget has not been solved.
  useEffect(() => {
    if (disabled || !SITE_KEY) return

    let cancelled = false

    setToken(null)
    setStatus('loading')

    loadTurnstile()
      .then(() => {
        if (cancelled) return

        // The script can "load" without giving this hook an API.
        // A content blocker, or an enterprise proxy that answers 200 with a stub, does exactly this.
        // This treats a missing API as blocked.
        // Returning early instead would strand `status` on `'loading'`, leaving a permanently disabled submit button with no mailto escape.
        if (!challengeRef.current || !window.turnstile) {
          setStatus('blocked')

          return
        }

        widgetIdRef.current = window.turnstile.render(challengeRef.current, {
          sitekey: SITE_KEY,
          theme,
          language: languageCode,
          // Turnstile's `retry` option defaults to `auto`.
          // So a transient failure is often followed by an automatic retry that solves.
          // So `blocked` must NOT be a one-way latch.
          // A solved challenge has to win the form back.
          // Otherwise the user holds a valid token while the UI still offers only the mailto escape.
          callback: (solved) => {
            setToken(solved)
            setStatus('ready')
          },
          'error-callback': () => {
            setToken(null)
            setStatus('blocked')
          },
          'expired-callback': () => setToken(null),
        })
        // `render` returns undefined instead of a widget id when it refuses.
        // The most common cause is a sitekey the embedding domain is not registered for.
        // No widget means no token, so this state is blocked, not ready.
        setStatus(widgetIdRef.current ? 'ready' : 'blocked')
      })
      .catch(() => {
        if (!cancelled) setStatus('blocked')
      })

    return () => {
      cancelled = true
      // This ref is written only past the `cancelled` guard above.
      // React runs this cleanup before the next effect body.
      // So the ref holds THIS run's widget, or nothing.
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current)
      widgetIdRef.current = undefined
    }
  }, [disabled, theme, languageCode])

  // This is stable across renders, with no dependencies.
  // The caller passes this straight to `useMutation`'s `onError`.
  // A fresh identity on each render would re-run the observer's `setOptions` for nothing.
  // `reset` re-runs the challenge, which calls the same `callback` on success.
  // So the new token arrives through the normal path.
  const reset = useCallback(() => {
    if (!widgetIdRef.current) return

    setToken(null)
    window.turnstile?.reset(widgetIdRef.current)
  }, [])

  return { challengeRef, token, status, reset }
}
