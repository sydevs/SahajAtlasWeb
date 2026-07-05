import z from 'zod'

import { RegionRefSchema } from './region-ref'

// `GET /api/clients/me` — the widget's own SahajCloud service document, used to
// bootstrap its locale, theme colors, and home region. `region` resolves to a
// RegionRef at depth=1; `allowedDomains` is a newline-separated list.
export const ClientSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  locale: z.string().nullish(),
  color1: z.string().nullish(),
  color2: z.string().nullish(),
  color3: z.string().nullish(),
  allowedDomains: z.string().nullish(),
  clientId: z.string().nullish(),
  region: z.union([RegionRefSchema, z.number(), z.null()]).optional(),
  legacyConfig: z
    .object({
      routing_type: z.string().nullish(),
      embed_type: z.string().nullish(),
      default_view: z.string().nullish(),
    })
    .passthrough()
    .nullish(),
})
export type Client = z.infer<typeof ClientSchema>
