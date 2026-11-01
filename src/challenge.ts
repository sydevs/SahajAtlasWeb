/**
 * The Turnstile challenge, rendered on the widget's OWN origin and framed by the widget (#343).
 *
 * Why this page exists at all is in `src/lib/turnstile-frame.ts`: Turnstile checks the hostname
 * of the document that renders it, so a script embed rendering the challenge inside the host's
 * page failed on every partner hostname. Everything here runs in a frame the widget mounts; it
 * is never a page a visitor navigates to.
 *
 * ⚠ **This page hands its token to WHOEVER frames it, and nothing here can tell our widget on
 * a partner's page from a third party's frame.** The target origin is `'*'` and the inbound
 * `reset` is accepted from the parent without an origin check, because the parent's origin is
 * the host site's — unknown here, different per partner, and knowing it would need the
 * allowlist this whole approach exists to avoid. Nothing restricts framing either: no
 * `frame-ancestors`, no `X-Frame-Options`.
 *
 * What that does NOT cost, measured rather than assumed: minting a token for this site key was
 * never gated. The production key lists `localhost` and `127.0.0.1`, so anyone could already
 * serve a page there and solve as many as they liked, and SahajCloud redeems each one only
 * once.
 *
 * What it DOES cost is a token solved in somebody else's visitor's browser. That token carries
 * that visitor's address, which is the address `verifyTurnstileToken` passes siteverify as
 * `remoteip`, and a residential browser is scored better than an automation farm — so a write
 * driven from it looks more legitimate than one driven from a minting host. `reset` lets a
 * framer re-arm the same frame and take a stream rather than one.
 *
 * ⚠ **No client-side change fixes this**, since every framer can replay any handshake this
 * public page defines. The two real answers are a `frame-ancestors` allowlist fetched at
 * runtime from the client records, or SahajCloud binding a token to something a harvester
 * cannot replay — `verifyTurnstile.ts` checks `success` alone today, no `action`, no `hostname`.
 * Both need a decision, and both were out of #343's scope. See the question thread on the pull
 * request that introduced this file.
 */

import {
  type ChallengeEvent,
  type ChallengeOptions,
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
  theme?: ChallengeOptions['theme']
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
  // The div is this document's own, so the fallback is for nothing that can happen rather than
  // a case to branch on. `challenge.html` carries the id because the smoke lane reads it back
  // to tell this page from the SPA shell a missing deploy would serve in its place.
  const container = document.getElementById('challenge') ?? document.body
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
  // This is the Cloudflare-facing hop, and the only one. Cloudflare learns this origin
  // regardless — that is the hostname check. What this keeps off the request is the path and
  // query, which carry the parent's theme and language.
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
