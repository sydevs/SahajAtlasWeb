import z from 'zod'

import { EventSlimSchema } from './event'
import { RegionLevelSchema, RegionRefSchema } from './region-ref'

// Re-export the low-level refs so `@/types` consumers still reach them here.
export { RegionLevelSchema, BreadcrumbSchema, RegionRefSchema } from './region-ref'
export type { RegionLevel, Breadcrumb, RegionRef } from './region-ref'

// Shared geo primitives for derived view-models.
export const BoundsSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
export const PositionSchema = z.tuple([z.number(), z.number()])

// Raw region document from `GET /api/regions`. `webPath`/`webUrl` (from RegionRef)
// are the server-computed canonical route; the ISO country code survives only on
// legacyData (used for flags + localized country names).
export const RegionDocSchema = RegionRefSchema.extend({
  legacyData: z.object({ countryCode: z.string().nullish() }).passthrough().nullish(),
})
export type RegionDoc = z.infer<typeof RegionDocSchema>

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
// with ≥ 2 located events (a single-event child is promoted into `events` instead);
// `events` holds this region's *located* events, and `onlineEvents` rolls up every
// placeless online event under it. `bounds` frames the map for all levels (online
// events never contribute); `center` is the derived point a `center` (venue) uses
// when it has no bounds. `countryCode` is set only for countries.
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
  // Located events only (promoted single-event children + events directly under the
  // region); never online — those live in `onlineEvents`. The two sets are disjoint.
  events: z.array(EventSlimSchema),
  // Placeless online events under this region's subtree, rolled up onto every level.
  onlineEvents: z.array(EventSlimSchema),
})
export type Region = z.infer<typeof RegionSchema>
