import { useCallback, useState } from 'react'

import { setFrame } from '@/lib/overlay'

/**
 * This adopts this component's element as the widget's FRAME, the box the fixed layer resolves against.
 * It tells the caller when it may render its children.
 *
 * Two components take the containing block with `contain: layout`, and both need exactly this.
 * They are `CompactEmbedView`'s expanded dialog, #161, and `MapFrame`, #169.
 * This logic lived twice, with the timing argument written out beside each copy, until the second copy drifted within a single commit.
 * One copy grew an unmount effect the other never had.
 * Now there is one hook and one contract, and `MapFrame.test.tsx` covers both.
 *
 * ⚠ **The node is STATE, not a ref, and the children wait for it.** That is the whole contract.
 * `overlayContainer()` and `frameElement()` are read in render BODIES all over the app: the drawer's portal target, vaul's snap measurement box, the widget's own width.
 * A target published in a passive effect would arrive one commit late, and the first drawer would portal itself outside the frame it is supposed to live in.
 * A callback ref publishes during the layout phase, and the resulting re-render flushes before paint.
 * So nothing is ever visible in the unpublished state.
 *
 * `adopt` has a stable identity. Otherwise every render would release and re-adopt.
 *
 * **Release needs no effect.**
 * React invokes a callback ref with `null` on unmount, and ref detach runs ahead of passive-effect cleanup.
 * So the `setFrame(null)` call below is always the release.
 * An unmount effect beside it could only ever be a second, unconditional clear of a singleton that by then belongs to somebody else.
 *
 * @returns `node` (render `{node && children}`) and `adopt`, for the element's `ref`.
 */
export function useFrame<T extends HTMLElement>(): {
  node: T | null
  adopt: (element: T | null) => void
} {
  const [node, setNode] = useState<T | null>(null)
  const adopt = useCallback((element: T | null) => {
    setFrame(element)
    setNode(element)
  }, [])

  return { node, adopt }
}
