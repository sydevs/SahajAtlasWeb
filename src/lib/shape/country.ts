import { type RegionTreeNode, indexRegions, subtreeIds } from './hierarchy'

/**
 * "Does this country list any programs at all?" — the filter-independent question
 * behind the country-website offer (issue #82). A search that empties because a
 * country simply has nothing is a different state from one the filters or the
 * distance cap emptied, and only the first should offer a way out to the country's
 * own site.
 */

/** The minimal feed-feature shape the check needs: each event's direct region. */
export type RegionedFeature = { properties: { region?: { id: number } | null } }

/**
 * Whether any event in the feed falls under `countryCode`'s region subtree.
 *
 * Country slugs *are* lowercase ISO codes post-SahajCloud#556, so the country node
 * is found by slug and the test is a subtree membership check over the wholesale
 * `['regions']` tree — an event pinned to a city or venue several levels down still
 * counts as one of its country's programs.
 *
 * Deliberately NOT built on `buildRegionMatcher`: that resolves an unknown slug to
 * `undefined` meaning "no region restriction", which read as a boolean here would
 * say *has programs* — the exact opposite of what an absent country means. A
 * country missing from the tree has no programs by definition, and that's the case
 * the offer exists to catch.
 *
 * Answers `false` while either input is still loading — the offer stays hidden
 * until the feed can actually confirm the country is empty, never on a cache miss.
 */
export const countryHasPrograms = (
  regions: RegionTreeNode[] | undefined,
  features: readonly RegionedFeature[] | undefined,
  countryCode: string | null | undefined,
): boolean => {
  if (!countryCode || !regions?.length || !features?.length) return false

  const index = indexRegions(regions)
  const country = index.bySlug.get(countryCode.toLowerCase())

  if (!country) return false

  const subtree = subtreeIds(index, country.id)

  return features.some(
    (feature) => feature.properties.region != null && subtree.has(feature.properties.region.id),
  )
}
