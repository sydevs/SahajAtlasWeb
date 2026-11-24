import type { RegionNode } from '@/types'

import { isoCountryCode, placePathsOf, placedPathname, resolveStack } from '@/lib/shape'

/**
 * The place the inline embed's heading names for a route: the deepest region on it that is not
 * a venue, so a venue or a class names the city it sits in. `undefined` at the root, and on a
 * route that names no region at all (search, online), where the heading is the world's title.
 *
 * Read off the region tree rather than the words typed, as the drawer stack's strips are:
 * `/united-kingdom/south-east/london` names London under the UK. A country takes the visitor's
 * own language for its name; anything else takes the tree's.
 *
 * A module of its own, like `DrawerStack/strip-label.ts`, so a spec need not load the map.
 */
export function headingPlace(
  pathname: string,
  regions: readonly RegionNode[] | undefined,
  countryName: (code: string) => string | undefined,
): string | undefined {
  const nodes = new Map(regions?.map((node) => [node.slug, node]))
  const entries = resolveStack(placedPathname(pathname, placePathsOf(regions)))

  for (const entry of [...entries].reverse()) {
    if (entry.kind !== 'region') continue

    const node = nodes.get(entry.slug)

    if (node?.level === 'venue') continue

    // Only a country's slug is its code: a city slugged `as` is not American Samoa
    // (`lib/shape/country.ts`). Before the tree arrives, a two-letter slug is the best guess.
    const code = !node || node.level === 'country' ? isoCountryCode(entry.slug) : undefined

    return (code && countryName(code)) || node?.name || undefined
  }
}
