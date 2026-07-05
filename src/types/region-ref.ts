import z from 'zod'

// Low-level region primitives referenced by *events* and *clients* (which embed a
// region), split out from the region view-model in `region.ts` to break the
// import cycle: `event.ts` needs `RegionRef`, and the `Region` view-model needs
// `EventSlim`. Keeping these here (no import of `event.ts`) enforces a clean DAG
// region-ref → event → region.

// SahajCloud region taxonomy. The backend `level` values the widget routes on.
export const RegionLevelSchema = z.enum(['country', 'region', 'city', 'center'])
export type RegionLevel = z.infer<typeof RegionLevelSchema>

// One entry of the nested-docs `breadcrumbs` chain (country → … → self). Only the
// ancestor `id`s are consumed — to aggregate event counts/bounds under a region
// (see src/lib/shape/hierarchy.ts). At the feed's depth `doc` is a numeric id; a
// deeper read may inline it as `{ id }`. Nested paths come from the server
// `webPath` now, not from breadcrumb slugs.
export const BreadcrumbSchema = z.object({
  doc: z.union([z.number(), z.object({ id: z.number() })]).nullish(),
  label: z.string().nullish(),
})
export type Breadcrumb = z.infer<typeof BreadcrumbSchema>

// Populated region reference — the subset selected in the geojson feed's
// `populate[regions]` and on raw region reads. `webPath` is the server-computed
// canonical route (ancestor slug chain incl. self); `webUrl` is its absolute form.
export const RegionRefSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string().nullish(),
  level: RegionLevelSchema,
  subtitle: z.string().nullish(),
  breadcrumbs: z.array(BreadcrumbSchema).nullish(),
  webPath: z.string().nullish(),
  webUrl: z.string().nullish(),
})
export type RegionRef = z.infer<typeof RegionRefSchema>
