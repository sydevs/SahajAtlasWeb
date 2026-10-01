import { useCallback, useState } from 'react'

/**
 * This publishes this component's element to a module singleton that render bodies read, and
 * tells the caller when it may render its children.
 *
 * Two singletons need exactly this. The widget's FRAME (`setFrame`), the box the fixed layer
 * resolves against, taken by `CompactEmbedView`'s expanded dialog (#161) and `MapFrame` (#169).
 * And the THEME ROOT (`setThemeRoot`), the wrapper in `Widget.tsx` that every portal lands in when
 * no frame is live.
 * Never hand-copy it: copies have drifted twice. `MapFrame.test.tsx` and
 * `Widget.theme-root.test.tsx` pin both uses.
 *
 * ⚠ **The node is STATE, not a ref, it is published from the callback ref, and the children wait
 * for it.** That is the whole contract.
 * `overlayContainer()` and `frameElement()` are read in render BODIES all over the app: the
 * drawer's portal target, the dialog's, vaul's snap measurement box, the widget's own width.
 * A node published in any child's effect arrives after that child's first render. A parent's ref
 * attaches only after its children's layout effects run, so reading a ref there is later still.
 * A callback ref publishes during the layout phase, and the resulting re-render flushes before
 * paint, so nothing is ever visible in the unpublished state.
 *
 * `adopt` has a stable identity as long as `publish` does. Otherwise every render would release
 * and re-adopt.
 *
 * **Release needs no effect.**
 * React invokes a callback ref with `null` on unmount, and ref detach runs ahead of passive-effect
 * cleanup. So `publish(null)` is always the release.
 * An unmount effect beside it could only ever be a second, unconditional clear of a singleton that
 * by then belongs to somebody else.
 *
 * @param publish A stable module function that stores the node, or `null` on release.
 * @returns `node` (render `{node && children}`) and `adopt`, for the element's `ref`.
 */
export function usePublishedNode<T extends HTMLElement>(
  publish: (element: T | null) => void,
): {
  node: T | null
  adopt: (element: T | null) => void
} {
  const [node, setNode] = useState<T | null>(null)
  const adopt = useCallback(
    (element: T | null) => {
      publish(element)
      setNode(element)
    },
    [publish],
  )

  return { node, adopt }
}
