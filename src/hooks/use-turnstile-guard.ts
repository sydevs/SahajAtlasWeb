import { useEffect, useState } from 'react'

import { atlasError, reportIntegrationWarning } from '@/lib/report'
import { probeTurnstile } from '@/hooks/use-turnstile'

/**
 * This is where a host's developer is told what to change.
 * `docs/embedding.md` carries the durable version. This is the copy that reaches them when the page is actually in front of them.
 *
 * This appears on the console, not on the screen, because the two audiences are different people.
 * The visitor gets `error.captcha_blocked`, which says the embed is broken without asking them to do anything about it.
 * The person who can edit the CSP gets the directive instead.
 */
const CSP_ADVICE =
  'Turnstile could not load, so registration and issue reports are impossible on this page. ' +
  "Allow https://challenges.cloudflare.com in this page's Content-Security-Policy — " +
  'both `script-src` and `frame-src`. See https://github.com/sydevs/SahajAtlasWeb/blob/main/docs/embedding.md#content-security-policy'

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
 * Injecting a third-party challenge script into a host's page for a card nobody has pressed would be the fifth.
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

    void probeTurnstile().then((available) => {
      if (cancelled || available) return

      // This runs before the throw, not after.
      // The throw unmounts this tree, and the console line is the only part of this addressed to somebody who can fix it.
      reportIntegrationWarning(CSP_ADVICE)
      setBlocked(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (blocked) throw atlasError('captcha-blocked', 'Turnstile could not be loaded')
}
