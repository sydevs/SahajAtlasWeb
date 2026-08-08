import { useWidgetMode } from '@/config/mode'
import { shareableUrl } from '@/lib/url'

/**
 * The URL to put in front of a human for the event being viewed — its canonical page when
 * it has one, the current address when that identifies the route, and `undefined` when
 * neither is true (issue #115).
 *
 * The decision itself is `shareableUrl` (`lib/url.ts`), pure and covered in the node lane.
 * This hook exists only to feed it the two things a pure function can't reach: the
 * `linkable` mode axis and `window.location.href`. Consumers take the answer and decide
 * what to render without one — deliberately, because "no link" is not a share block with
 * an empty field, it is a different screen.
 *
 * Read during render, like the `window.location.href` reads it replaces. The value can go
 * stale within a session (an in-widget navigation doesn't re-render every consumer), which
 * is harmless here: both call sites re-render on the event they're keyed to, and the
 * canonical — the answer in the overwhelming majority of cases — doesn't depend on the
 * address bar at all.
 */
export function useShareUrl(canonical: string | null | undefined): string | undefined {
  const { linkable } = useWidgetMode()

  return shareableUrl(
    canonical,
    typeof window === 'undefined' ? undefined : window.location.href,
    linkable,
  )
}
