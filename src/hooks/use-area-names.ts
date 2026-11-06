import { useEffect, useMemo, useState } from 'react'

import { useWidgetMode } from '@/config/mode'
import {
  type AreaNames,
  MAX_AREA_LOOKUPS,
  areaKey,
  cachedAreaNames,
  lookupAreaNames,
} from '@/lib/area-names'

/** How many lookups run at once. */
const PARALLEL = 4

const NONE = new Map<string, AreaNames>()

/**
 * The area names (`lib/area-names`) for these spots, keyed by `areaKey`. What the visit already
 * knows is there at once; the rest is looked up a few at a time and arrives together, so a
 * calendar redraws its labels once rather than once per class. PROTOTYPE: see `area-names`.
 *
 * ⚠ Nothing at all with `map=false` (or before a list-first embed opens its map): the names come
 * from Mapbox, and a mapless embed promises its host no Mapbox request (`docs/embedding.md`).
 */
export function useAreaNames(points: [number, number][], locale: string) {
  const { hasMap } = useWidgetMode()
  const unique = useMemo(() => {
    if (!hasMap) return []

    const byKey = new Map(points.map((point) => [areaKey(point), point] as const))

    return [...byKey.values()].slice(0, MAX_AREA_LOOKUPS)
  }, [points, hasMap])
  const signature = unique.map(areaKey).join('|')
  const [names, setNames] = useState<Map<string, AreaNames>>(() => known(unique, locale))

  useEffect(() => {
    let cancelled = false
    const todo = unique.filter((point) => !cachedAreaNames(point, locale))

    setNames(known(unique, locale))
    if (todo.length === 0) return

    const run = async () => {
      for (let i = 0; i < todo.length; i += PARALLEL) {
        await Promise.all(
          todo.slice(i, i + PARALLEL).map((point) => lookupAreaNames(point, locale)),
        )
        if (cancelled) return
      }
      setNames(known(unique, locale))
    }

    void run()

    return () => {
      cancelled = true
    }
    // `signature` stands for `unique`, whose identity changes with every new list of points.
  }, [signature, locale])

  return hasMap ? names : NONE
}

const known = (points: [number, number][], locale: string) =>
  new Map(
    points.flatMap((point) => {
      const names = cachedAreaNames(point, locale)

      return names ? [[areaKey(point), names] as const] : []
    }),
  )
