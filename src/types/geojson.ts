import z from 'zod'

import { AgnosticFeedEventSchema } from './event'

// `GET /api/events/geojson` — a FeatureCollection whose feature `properties` is the
// selected event document, LOCALE-AGNOSTIC (no `title`; it's joined per-locale by
// id). Geometry is null for online events or when coordinates weren't selected.
// Pagination foreign members are ignored.
export const GeoFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.number().optional(),
  geometry: z
    .object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .nullable(),
  properties: AgnosticFeedEventSchema,
})
export type GeoFeature = z.infer<typeof GeoFeatureSchema>

export const GeojsonSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GeoFeatureSchema),
})
export type Geojson = z.infer<typeof GeojsonSchema>
