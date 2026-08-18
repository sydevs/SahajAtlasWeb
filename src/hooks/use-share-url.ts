import { useHrefFor } from '@/config/routing'
import { shareableUrl } from '@/lib/url'

/**
 * The URL to put in front of a human for the event being viewed — its canonical page when it has
 * one, its own widget URL when the route is in a URL at all, and `undefined` when neither is true
 * (issues #115, #154).
 *
 * The decision itself is `shareableUrl` (`lib/url.ts`), pure and covered in the node lane. This
 * hook exists only to feed it the one thing a pure function cannot reach: the route resolver, which
 * is `undefined` in memory mode and is therefore also the answer to "is our route in a URL". That
 * replaces the older reading of the `linkable` axis plus `window.location.href` — one source
 * instead of two, which is what stops them drifting.
 *
 * Consumers take the answer and decide what to render without one — deliberately, because "no
 * link" is not a share block with an empty field, it is a different screen.
 */
export function useShareUrl(
  canonical: string | null | undefined,
  route?: string,
): string | undefined {
  const hrefFor = useHrefFor()

  return shareableUrl(canonical, route && hrefFor ? hrefFor(route) : undefined)
}
