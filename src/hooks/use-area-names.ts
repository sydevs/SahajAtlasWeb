import { useEffect, useMemo, useState } from 'react'

import { type AreaNames, areaKey, cachedAreaNames, lookupAreaNames } from '@/lib/area-names'

/** How many spots one screen looks up at most, so a world-wide calendar can't send hundreds. */
const MAX_LOOKUPS = 80
/** How many lookups run at once. */
const PARALLEL = 4

/**
 * The area names (`lib/area-names`) for these spots, keyed by `areaKey`. What the visit already
 * knows is there at once; the rest is looked up a few at a time and arrives together, so a
 * calendar redraws its labels once rather than once per class. PROTOTYPE: see `area-names`.
 */
export function useAreaNames(points: [number, number][], locale: string) {
  const unique = useMemo(() => {
    const byKey = new Map(points.map((point) => [areaKey(point), point] as const))

    return [...byKey.values()]
  }, [points])
  const signature = unique.map(areaKey).join('|')
  const [names, setNames] = useState<Map<string, AreaNames>>(() => known(unique))

  useEffect(() => {
    let cancelled = false
    const todo = unique.filter((point) => !cachedAreaNames(point)).slice(0, MAX_LOOKUPS)

    setNames(known(unique))
    if (todo.length === 0) return

    const run = async () => {
      for (let i = 0; i < todo.length; i += PARALLEL) {
        await Promise.all(
          todo.slice(i, i + PARALLEL).map((point) => lookupAreaNames(point, locale)),
        )
        if (cancelled) return
      }
      setNames(known(unique))
    }

    void run()

    return () => {
      cancelled = true
    }
    // `signature` stands for `unique`, whose identity changes with every new list of points.
  }, [signature, locale])

  return names
}

const known = (points: [number, number][]) =>
  new Map(
    points.flatMap((point) => {
      const names = cachedAreaNames(point)

      return names ? [[areaKey(point), names] as const] : []
    }),
  )
