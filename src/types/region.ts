import z from 'zod'

import { EventSlimSchema } from './event'
import { RegionLevelSchema } from './region-ref'

// Re-export the low-level refs so `@/types` consumers still reach them here.
export { RegionLevelSchema, RegionRefSchema } from './region-ref'
export type { RegionLevel, RegionRef } from './region-ref'

// Shared geo primitives for derived view-models.
export const BoundsSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export const PositionSchema = z.tuple([z.number(), z.number()])

// One node of the wholesale region tree from `GET /api/regions` (depth 0, every
// level, read once). `parent` is the parent region's id — null for a country root —
// and the widget walks these links client-side for ancestry + child lists, which
// replaces the per-navigation region reads. `webPath`/`webUrl` are the
// server-computed canonical route. `legacyData` is transitional: `countryCode`
// derives from the slug first (post-SahajCloud#556 the country slug *is* the ISO
// code), falling back to this until the backend seed reflects that migration.
export const RegionNodeSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string().nullish(),
  subtitle: z.string().nullish(),
  level: RegionLevelSchema,
  parent: z.number().nullish(),
  webPath: z.string().nullish(),
  webUrl: z.string().nullish(),
  // Only `countryCode` is kept — the rest of the legacy blob (osmId/legacyId/…) is
  // stripped at this boundary (no `.passthrough()`) so it never reaches the public
  // `['regions']` cache. The whole field goes once the seed reflects SahajCloud#556.
  legacyData: z.object({ countryCode: z.string().nullish() }).nullish(),
})
export type RegionNode = z.infer<typeof RegionNodeSchema>

// Derived list item for a region shown under a parent (country/region page) or in
// the home country list. `countryCode` is set only for countries (drives the flag
// + localized name); `path` is the item's full nested route.
export const RegionListItemSchema = z.object({
  id: z.number(),
  slug: z.string(),
  level: RegionLevelSchema,
  name: z.string(),
  subtitle: z.string().nullish(),
  countryCode: z.string().nullish(),
  eventCount: z.number(),
  path: z.string(),
})
export type RegionListItem = z.infer<typeof RegionListItemSchema>

// One derived view-model for every region level. `subregions` lists child regions
// with any located events; `events` holds this region's own *located* events (those
// under no child — a leaf's whole list), and `onlineEvents` rolls up every placeless
// online event under it. `bounds` frames the map for all levels (online events never
// contribute); `center` is the derived point a `center` (venue) uses when it has no
// bounds. `countryCode` is set only for countries.
export const RegionSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  level: RegionLevelSchema,
  subtitle: z.string().nullish(),
  countryCode: z.string().nullish(),
  eventCount: z.number(),
  bounds: BoundsSchema.nullable(),
  center: PositionSchema.nullable(),
  path: z.string(),
  parentPath: z.string().nullish(),
  // Absolute canonical URL (server webUrl) for the page's <link rel="canonical">.
  webUrl: z.string().nullish(),
  subregions: z.array(RegionListItemSchema),
  // This region's own located events (those under no child — a leaf's whole list);
  // never online — those live in `onlineEvents`. The two sets are disjoint.
  events: z.array(EventSlimSchema),
  // Placeless online events under this region's subtree, rolled up onto every level.
  onlineEvents: z.array(EventSlimSchema),
})
export type Region = z.infer<typeof RegionSchema>
