import z from 'zod'

// Low-level region primitives referenced by *events* and *clients* (which embed a
// region), split out from the region view-model in `region.ts` to break the
// import cycle: `event.ts` needs `RegionRef`, and the `Region` view-model needs
// `EventSlim`. Keeping these here (no import of `event.ts`) enforces a clean DAG
// region-ref → event → region.

// SahajCloud region taxonomy. The backend `level` values the widget routes on.
export const RegionLevelSchema = z.enum(['country', 'region', 'city', 'center'])
export type RegionLevel = z.infer<typeof RegionLevelSchema>

// Populated region reference — the subset selected in the geojson feed's
// `populate[regions]` and on raw region reads. `webPath` is the server-computed
// canonical route (ancestor slug chain incl. self); `webUrl` is its absolute form.
// Ancestry comes from the wholesale regions dict (parent links), not breadcrumbs.
export const RegionRefSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string().nullish(),
  level: RegionLevelSchema,
  subtitle: z.string().nullish(),
  webPath: z.string().nullish(),
  webUrl: z.string().nullish(),
})
export type RegionRef = z.infer<typeof RegionRefSchema>
