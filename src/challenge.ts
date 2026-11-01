/**
 * The Turnstile challenge, rendered on the widget's OWN origin and framed by the widget (#343).
 *
 * Why this page exists at all is in `src/lib/turnstile-frame.ts`: Turnstile checks the hostname
 * of the document that renders it, so a script embed rendering the challenge inside the host's
 * page failed on every partner hostname. Everything here runs in a frame the widget mounts; it
 * is never a page a visitor navigates to.
 *
 * ⚠ **Every framer is untrusted, and that is fine.** A Turnstile token is single-use and only
 * redeemable against SahajCloud's secret for this site key, so anybody who frames this page can
 * obtain one exactly as they could by loading Turnstile themselves. That is why the token goes
 * out with `'*'` as the target origin: the parent's origin is the host site's, unknown here and
 * different per partner, and pinning it would need a list this approach exists to avoid.
 */

import {
  type ChallengeEvent,
  challengeMessage,
  parseChallengeCommand,
  readChallengeOptions,
} from '@/lib/turnstile-frame'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// The site key is public by design — the secret half lives in SahajCloud. This page is its one
// reader now, so `scripts/turnstile-release-guard.mjs` gates the build that inlines it here.
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
  reset: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

function send(message: ChallengeEvent) {
  window.parent.postMessage(challengeMessage(message), '*')
}

function mount() {
  const container = document.getElementById('challenge')

  if (!container) {
    send({ type: 'error' })

    return
  }

  const options = readChallengeOptions(window.location.search)

  // No key means no captcha anywhere in the widget, so the handshake must NOT succeed: the
  // eager check reads its absence as a blocked embed and fails the widget to the
  // captcha-blocked screen, which is the behaviour an unset build variable has always had.
  if (!SITE_KEY) {
    send({ type: 'error' })

    return
  }

  const script = document.createElement('script')

  script.src = SCRIPT_URL
  script.async = true
  // Cloudflare learns this origin regardless — it is the hostname check. This keeps the path
  // and query off the request, which now carry the parent's theme and language.
  script.referrerPolicy = 'strict-origin'
  script.addEventListener('error', () => send({ type: 'error' }))
  script.addEventListener('load', () => {
    const turnstile = window.turnstile

    // A script that loads without defining the API is a content blocker or a proxy answering
    // 200 with a stub. Reported as an error rather than left to the parent's timeout, so the
    // widget fails in a second instead of ten.
    if (!turnstile) {
      send({ type: 'error' })

      return
    }

    send({ type: 'ready' })

    if (options.probe) return

    const widgetId = turnstile.render(container, {
      sitekey: SITE_KEY,
      theme: options.theme,
      language: options.language,
      callback: (token) => send({ type: 'token', token }),
      'error-callback': () => send({ type: 'error' }),
      'expired-callback': () => send({ type: 'expired' }),
    })

    // `render` returns no id when it refuses. With the challenge on our own origin the
    // hostname mismatch that used to cause this cannot happen, so what is left is a
    // malformed key — still no widget, so still no token.
    if (!widgetId) {
      send({ type: 'error' })

      return
    }

    window.addEventListener('message', (event) => {
      // Only the window that framed this page may drive it. A token is worth nothing to a
      // third party, but a reset from one would discard a challenge the visitor just solved.
      if (event.source !== window.parent) return
      if (parseChallengeCommand(event.data)) turnstile.reset(widgetId)
    })
  })

  document.head.appendChild(script)
}

mount()
