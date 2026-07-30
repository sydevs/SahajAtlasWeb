import { type RegionTreeNode, indexRegions, subtreeIds } from './hierarchy'

/**
 * Countries: the one canonical ISO alpha-2 form, and "does this country list any
 * programs at all?" — the filter-independent question behind the country-website
 * offer (issue #82). A search that empties because a country simply has nothing is a
 * different state from one the filters or the distance cap emptied, and only the
 * first should offer a way out to the country's own site.
 */

/**
 * A country code normalized to the app's canonical form: **uppercase** alpha-2, or
 * `undefined` for anything else.
 *
 * Upper is canonical because `Intl.DisplayNames({ type: 'region' })` is
 * case-sensitive — `.of('gb')` echoes back `"gb"` while `.of('GB')` resolves
 * "United Kingdom". Callers needing lower (`CircleFlag`, a region slug) lowercase it
 * at the call site.
 *
 * Guarding the shape here means a malformed value — an un-migrated region slug, a
 * hand-typed `?cc=USA` — yields no country rather than throwing downstream in
 * `Intl.DisplayNames` / `CircleFlag`. Shared by the region tree's `countryCodeOf`
 * (src/config/api/fetch.ts), the searched-country reader, and the IP guess.
 */
export const isoCountryCode = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : undefined

/**
 * The minimal region-tree shape the country lookup needs — `RegionTreeNode` plus the
 * `level` the slug match is qualified by. Structural (not `RegionNode`) to keep this
 * module free of the entity types, like `hierarchy.ts`.
 */
export type CountryTreeNode = RegionTreeNode & { level: string }

/**
 * The minimal feed-feature shape the check needs: each event's direct region, which
 * the feed always carries (`AgnosticFeedEventSchema.region` is required and
 * non-nullable) — including for online events, which belong to no *place* but are
 * still listed under a region.
 */
export type RegionedFeature = { properties: { region: { id: number } } }

/**
 * Whether any event in `features` falls under `countryCode`'s region subtree.
 *
 * Country slugs *are* lowercase ISO codes post-SahajCloud#556, so the country node
 * is found by slug and the test is a subtree membership check over the wholesale
 * `['regions']` tree — an event pinned to a city or venue several levels down still
 * counts as one of its country's programs.
 *
 * Pass the FULL feed, not a filtered list: the question is whether the country has
 * anything at all, independent of the active filters. Both inputs are required — the
 * "still loading" case belongs to the caller (`useCountrySite`), so a cache miss can
 * never be mistaken here for a confirmed-empty country.
 *
 * Shares the subtree mechanics (`indexRegions` + `subtreeIds`) with
 * `buildRegionMatcher`, but deliberately isn't built on it: that maps an unknown slug
 * to `undefined` = "no region restriction", whose boolean reading would be *has
 * programs* — the exact opposite of what an absent country means here. Keeping them
 * separate means the filter's unknown-slug policy can change without silently
 * redefining "has programs".
 */
export const countryHasPrograms = (
  regions: CountryTreeNode[],
  features: readonly RegionedFeature[],
  countryCode: string,
): boolean => {
  const index = indexRegions(regions)
  const country = index.bySlug.get(countryCode.toLowerCase())

  // A country absent from the tree has no programs by definition — that's exactly
  // the case the offer exists to catch. `level` qualifies the match because slugs are
  // unique across the WHOLE tree, not per level: without it a two-letter slug at any
  // level (a city `as`) would answer for its namesake country (American Samoa).
  if (country?.level !== 'country') return false

  const subtree = subtreeIds(index, country.id)

  return features.some((feature) => subtree.has(feature.properties.region.id))
}
