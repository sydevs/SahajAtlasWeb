import { useCallback, useSyncExternalStore } from 'react'

/** The slice of an XState actor a component reads: what `createActor` returns satisfies it. */
export type Observable<S> = {
  getSnapshot(): S
  subscribe(listener: () => void): { unsubscribe(): void }
}

/**
 * One value read off an actor, re-rendering only when that value changes.
 *
 * `select` must return a primitive or a reference the snapshot already holds: a fresh object per
 * call reads as a change on every check, and React renders forever. `absent` stands in while
 * there is no actor yet, and on the server, where `renderToStaticMarkup` throws without one.
 */
export function useActorSelector<S, T>(
  actor: Observable<S> | null,
  select: (snapshot: S) => T,
  absent: T,
): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = actor?.subscribe(onChange)

      return () => subscription?.unsubscribe()
    },
    [actor],
  )
  const read = () => (actor ? select(actor.getSnapshot()) : absent)

  return useSyncExternalStore(subscribe, read, read)
}
