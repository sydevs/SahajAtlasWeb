import { useEffect } from 'react'

import { reportIntegrationWarning } from '@/lib/report'
import { probeTurnstile } from '@/hooks/use-turnstile'

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
 * sydevs/SahajCloud#1072): the challenge renders in a frame SahajCloud serves. The origin is read
 * off the configured API URL, so a build pointed at a local SahajCloud names the host it needs.
 * It names both causes rather than carrying SahajCloud's reason for a refusal: the browser logs a
 * CSP refusal itself, beside this line, which tells the two apart.
 */
const captchaAdvice = (serverOrigin: string, hostname: string) =>
  'Turnstile could not load, so registration and issue reports are impossible on this page. ' +
  `Either this page's Content-Security-Policy does not allow ${serverOrigin} under \`frame-src\` ` +
  '(the browser logs that refusal itself), ' +
  `or ${hostname} is not an allowed domain on your Sahaj Atlas client record. ` +
  `See ${GUIDE}#troubleshooting`

/**
 * This tells the host's developer when Turnstile cannot load. It no longer stops the widget.
 *
 * **It is eager, but not blocking.** The probe starts on mount, and nothing waits for it.
 *
 * **Why it no longer fails the interface.** #182 made a failed check take the widget down, so that
 * a host with a stale CSP would notice: every write is captcha-gated, and a quiet failure would let
 * visitors browse and then be unable to register. But the check also fails for reasons that have
 * nothing to do with the host. It is a frame on another origin with a 10-second handshake, so one
 * slow load replaced a working atlas with a message blaming the page (seen once in 30+ loads on an
 * iPhone). Browsing needs no token. So the failure now shows where a token is needed: the
 * registration form says so and offers a retry, and the report form has its own degraded state.
 * The console advice below still reaches the developer.
 *
 * ⚠ **Call this from the INTERFACE, never from the shell.**
 * `.claude/rules/components.md` is explicit that anything that fetches or injects a script must mount with `FullInterface`.
 * Mounting a challenge frame for a card nobody has pressed would break that.
 * `CompactEmbedView.mount.test.tsx` asserts that this does not happen.
 */
export function useTurnstileGuard(): void {
  useEffect(() => {
    let cancelled = false

    void probeTurnstile().then((available) => {
      if (cancelled || available) return

      reportIntegrationWarning(
        captchaAdvice(
          new URL(import.meta.env.VITE_SAHAJCLOUD_URL).origin,
          window.location.hostname,
        ),
      )
    })

    return () => {
      cancelled = true
    }
  }, [])
}
