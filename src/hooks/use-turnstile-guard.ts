import { useEffect } from 'react'

import { reportIntegrationWarning } from '@/lib/report'
import { probeTurnstile } from '@/hooks/use-turnstile'

const GUIDE = 'https://github.com/sydevs/SahajAtlasWeb/blob/main/docs/embedding.md'

/**
 * This is where a host's developer is told what to change.
 * `docs/embedding.md` carries the durable version. This is the copy that reaches them when the page is actually in front of them.
 *
 * This appears on the console, not on the screen, because the two audiences are different people.
 * The visitor sees the registration form's own message, which offers to try again.
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
 * Tells the host's developer when Turnstile cannot load, and blocks nothing.
 *
 * **It is eager, but not blocking.** The probe starts on mount, and nothing waits for it. Browsing
 * needs no token, and the check also fails for reasons that are not the host's — it is a frame on
 * another origin with a handshake that a slow load can miss (#182). So the failure shows where a
 * token is needed, in the forms, and the advice below reaches the developer on the console.
 *
 * ⚠ **Call this from the INTERFACE, never from the shell** — from `useInterfaceBoot`, beside the analytics and the
 * cache warm, which every interface form runs once. The shell renders before any interface does, and through the error
 * screens too.
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
