import type { BBox } from 'geojson'

import { useMemo } from 'react'

import { useNearVisitor } from '@/hooks/use-near-me'
import { useSearchCountry } from '@/hooks/use-search-country'
import { type PlaceScope } from '@/lib/shape'

/**
 * What decides which of a search's classes are in the place (`splitResults`): its box, its
 * country, and whether it is the visitor's own position. Read here once for the list, the camera
 * and the filter counts alike, so none of them can sort a class differently from the others.
 */
export const usePlaceScope = (
  center: readonly [number, number] | undefined,
  bbox: BBox | undefined,
): PlaceScope & { nearVisitor: boolean } => {
  const searchCountry = useSearchCountry()
  const nearVisitor = useNearVisitor(center)
  const bboxKey = bbox?.join()

  // The box is rebuilt from the URL on every render, so its string form is the dependency.
  return useMemo(
    () => ({ bbox, searchCountry, nearVisitor }),
    [bboxKey, searchCountry, nearVisitor],
  )
}
