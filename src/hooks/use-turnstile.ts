import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'

import { useLocale } from '@/hooks/use-locale'
import { useTheme } from '@/hooks/use-theme'

// Cloudflare Turnstile, rendered explicitly (issue #79). Hand-rolled rather than adding
// `@marsidev/react-turnstile`: it's a script tag and one render call, and the embedded
// bundle ships on host pages we don't control, so every dependency is weight we'd rather
// not add.
//
// The script is injected lazily on first use — a viewer who never opens the report form
// never pays for it — and the widget is removed on unmount, so reopening the modal always
// gets a fresh challenge rather than a stale/expired token.

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// A Turnstile SITE key is public by design (the secret half lives in SahajCloud), so it
// belongs in the committed `.env`. Absent ⇒ the captcha can't render, which is the same
// degraded state as a blocked script — the form falls back to the mailto route.
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

// One in-flight load shared by every caller. Cleared on failure so a later open retries
// rather than caching a transient network error forever.
let scriptPromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')

    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    // Cloudflare learns the embedding hostname regardless (that's how the domain check
    // works), but a host page that opts into `unsafe-url` referrers would otherwise leak
    // its full path + query on this request too. Send the origin only.
    script.referrerPolicy = 'strict-origin'
    script.onload = () => resolve()
    // Fires when a host page's CSP omits challenges.cloudflare.com from `script-src`,
    // and on an ordinary network failure.
    script.onerror = () => {
      // Drop the dead tag: with `scriptPromise` cleared below, every reopen retries, and
      // on a host page whose CSP blocks Cloudflare that would otherwise pile up an
      // orphaned <script> (and a blocked request) in their <head> each time.
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
 * `loading` until the challenge is rendered, `blocked` when Turnstile is unavailable —
 * no site key, a CSP-blocked script, or a widget that errors out (e.g. `frame-src`
 * blocks the challenge iframe). Callers must degrade on `blocked` rather than leaving a
 * submit button that can never produce a token.
 */
export type TurnstileStatus = 'loading' | 'ready' | 'blocked'

export type UseTurnstileOptions = {
  /** Skip loading entirely and report `blocked` — the Ladle story's degraded case. */
  disabled?: boolean
}

export type UseTurnstile = {
  /** Attach to the element the challenge renders into. */
  containerRef: RefObject<HTMLDivElement>
  /** The solved token, or null while unsolved/expired. */
  token: string | null
  status: TurnstileStatus
  /**
   * Discard the current token and re-run the challenge in place.
   *
   * **A Turnstile token is single-use**, and the server redeems it the moment it
   * verifies — before it does the work the token was gating. So after ANY failed
   * submit the token in hand may already be spent, and re-sending it would be refused
   * for the rest of the widget's life. A caller whose submit failed must reset rather
   * than offer a retry that cannot succeed.
   *
   * No-op while the challenge isn't rendered (blocked / still loading), so a caller
   * never has to check `status` first.
   */
  reset: () => void
}

export function useTurnstile({ disabled = false }: UseTurnstileOptions = {}): UseTurnstile {
  const containerRef = useRef<HTMLDivElement>(null)
  // Held in a ref as well as the effect closure, so `reset` can reach the live widget
  // without re-running (and thus re-rendering) the challenge.
  const widgetIdRef = useRef<string | undefined>(undefined)
  const [token, setToken] = useState<string | null>(null)
  const [status, setStatus] = useState<TurnstileStatus>(
    disabled || !SITE_KEY ? 'blocked' : 'loading',
  )
  const { theme } = useTheme()
  const { languageCode } = useLocale()

  // Re-rendering on a theme or language change is deliberate: Turnstile bakes both into
  // the widget at render time, so the challenge is torn down and re-rendered — which
  // also drops the token, correctly, since the new widget hasn't been solved.
  useEffect(() => {
    if (disabled || !SITE_KEY) return

    let widgetId: string | undefined
    let cancelled = false

    setToken(null)
    setStatus('loading')

    loadTurnstile()
      .then(() => {
        if (cancelled) return

        // The script can "load" without giving us an API — a content blocker or an
        // enterprise proxy that answers 200 with a stub does exactly this. Treat a
        // missing API as blocked; returning early would strand `status` on 'loading',
        // leaving a permanently disabled submit and no mailto escape.
        if (!containerRef.current || !window.turnstile) {
          setStatus('blocked')

          return
        }

        widgetId = widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme,
          language: languageCode,
          // Turnstile's `retry` defaults to `auto`, so a transient failure is followed by
          // an automatic retry that solves. `blocked` therefore must NOT be a one-way
          // latch: a solved challenge has to win the form back, or the user is left
          // holding a valid token while the UI still offers only the mailto escape.
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
        // `render` returns undefined rather than a widget id when it refuses — most
        // often a sitekey the embedding domain isn't registered for. No widget means no
        // token, so that is blocked, not ready.
        setStatus(widgetId ? 'ready' : 'blocked')
      })
      .catch(() => {
        if (!cancelled) setStatus('blocked')
      })

    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
      if (widgetIdRef.current === widgetId) widgetIdRef.current = undefined
    }
  }, [disabled, theme, languageCode])

  // Stable across renders (no deps) so a caller can hold it in a mutation callback
  // without re-subscribing. `reset` re-runs the challenge, which calls the same
  // `callback` on success — so the token comes back through the normal path.
  const reset = useCallback(() => {
    if (!widgetIdRef.current) return

    setToken(null)
    window.turnstile?.reset(widgetIdRef.current)
  }, [])

  return { containerRef, token, status, reset }
}
