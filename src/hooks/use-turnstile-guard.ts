import { useEffect, useState } from 'react'

import { atlasError, reportIntegrationWarning } from '@/lib/report'
import { type TurnstileVerdict, probeTurnstile } from '@/hooks/use-turnstile'

const GUIDE = 'https://github.com/sydevs/SahajAtlasWeb/blob/main/docs/embedding.md'

/**
 * This is where a host's developer is told what to change.
 * `docs/embedding.md` carries the durable version. This is the copy that reaches them when the page is actually in front of them.
 *
 * This appears on the console, not on the screen, because the two audiences are different people.
 * The visitor gets `error.captcha_blocked`, which says the embed is broken without asking them to do anything about it.
 * The person who can edit the CSP, or ask for their domain to be listed, gets the fix instead.
 *
 * ⚠ **It names SahajCloud's origin under `frame-src`, not Cloudflare's or ours** (#343,
 * sydevs/SahajCloud#1072). The challenge renders in a frame SahajCloud serves, so
 * `challenges.cloudflare.com` is governed by that frame's own policy and belongs in no directive
 * of the host's. The origin is read off the configured API URL rather than written out, so a
 * build pointed at a local SahajCloud names the host it actually needs allowed.
 */
export function turnstileAdvice(
  verdict: Exclude<TurnstileVerdict, 'available'>,
  serverOrigin: string,
  hostname: string,
): string {
  const lead =
    'Turnstile could not load, so registration and issue reports are impossible on this page. '

  if (verdict === 'origin') {
    return (
      lead +
      `${hostname} is not an allowed domain of any Sahaj Atlas client, so the security check refuses to run here. ` +
      'Ask the Sahaj Atlas team to add it to your client record. ' +
      `See ${GUIDE}#what-you-configure-in-the-cms-instead`
    )
  }

  return (
    lead +
    `If this page sends a Content-Security-Policy, allow ${serverOrigin} under \`frame-src\` — ` +
    'the challenge renders in a frame served from there. ' +
    `See ${GUIDE}#content-security-policy`
  )
}

/**
 * This fails the widget when Turnstile cannot load. See issue #182.
 *
 * **This is eager, but not blocking.** The probe starts on mount, and nothing waits for it.
 * The overwhelmingly common case is that it succeeds.
 * Making first paint depend on a third-party script would tax every healthy embed to catch the rare broken one.
 * The verdict lands whenever it arrives, and only a negative one does anything.
 *
 * **Why fail at all, instead of degrading?**
 * Registration is the whole point of the widget, and a registration cannot be sent without a token.
 * So a page where Turnstile is blocked is a page where the atlas cannot do its job.
 * Degrading quietly would leave a host believing their embed works, while every visitor who tries to register silently cannot.
 * Failing loudly gets the CSP fixed instead.
 * That trade is the decision recorded on the ticket, not one taken here.
 *
 * ⚠ **Call this from the INTERFACE, never from the shell.**
 * `.claude/rules/components.md` is explicit that anything that fetches or injects a script must mount with `FullInterface`.
 * Four separate bugs, the home-region redirect, `warmCaches`, and both Fathom effects, came from effects firing for a collapsed compact card.
 * Mounting a challenge frame for a card nobody has pressed would be the fifth.
 * `CompactEmbedView.mount.test.tsx` asserts that this does not happen.
 *
 * This throws during render, not from the effect.
 * So the failure is an ordinary render throw that the nearest boundary catches.
 * That boundary is `ErrorFallback`, through the `ResetErrorBoundary` in `App.tsx`, the widget-level screen this failure deserves.
 */
export function useTurnstileGuard(): void {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    let cancelled = false

    void probeTurnstile().then((verdict) => {
      if (cancelled || verdict === 'available') return

      // This runs before the throw, not after.
      // The throw unmounts this tree, and the console line is the only part of this addressed to somebody who can fix it.
      reportIntegrationWarning(
        turnstileAdvice(
          verdict,
          new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin,
          window.location.hostname,
        ),
      )
      setBlocked(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (blocked) throw atlasError('captcha-blocked', 'Turnstile could not be loaded')
}
