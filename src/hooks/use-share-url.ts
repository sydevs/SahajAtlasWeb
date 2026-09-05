import { useHrefFor } from '@/config/routing'
import { shareableUrl } from '@/lib/url'

/**
 * This returns the URL to put in front of a human for the event being viewed.
 * It is the canonical page when one exists, the widget's own URL when the route is in a URL at all, and `undefined` when neither is true. See issues #115 and #154.
 *
 * The decision itself lives in `shareableUrl`, in `lib/url.ts`, pure and covered in the node lane.
 * This hook exists only to feed it the one thing a pure function cannot reach: the route resolver.
 * That resolver is `undefined` in memory mode, so it also answers "is our route in a URL."
 * This replaces the older reading of the `linkable` axis plus `window.location.href`.
 * One source replaces two, which is what stops them drifting.
 *
 * Consumers take the answer and decide what to render without one, deliberately.
 * "No link" is not a share block with an empty field. It is a different screen.
 */
export function useShareUrl(
  canonical: string | null | undefined,
  route?: string,
): string | undefined {
  const hrefFor = useHrefFor()

  return shareableUrl(canonical, route && hrefFor ? hrefFor(route) : undefined)
}
