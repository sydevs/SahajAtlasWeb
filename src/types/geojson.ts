import type {
  EventFeature,
  EventFeatureCollection,
  GeoJsonPoint,
} from '@/types/payload/response-types'
import type { SahajCloudFields } from './pinned'

import z from 'zod'

import { AgnosticFeedEventSchema } from './event'

// `GET /api/events/geojson` — a FeatureCollection whose feature `properties` is the
// selected event document, LOCALE-AGNOSTIC (no `title`. It is joined per-locale by
// id). Geometry is null for online events or when coordinates were not selected.
// Pagination foreign members are ignored.
export const GeoFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: z.number().optional(),
  geometry: z
    .object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number(), z.number()]),
    } satisfies SahajCloudFields<GeoJsonPoint>)
    .nullable(),
  properties: AgnosticFeedEventSchema,
} satisfies SahajCloudFields<EventFeature>)
export type GeoFeature = z.infer<typeof GeoFeatureSchema>

export const GeojsonSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GeoFeatureSchema),
} satisfies SahajCloudFields<EventFeatureCollection>)
export type Geojson = z.infer<typeof GeojsonSchema>
