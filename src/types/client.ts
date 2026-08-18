import z from 'zod'

import { RegionRefSchema } from './region-ref'

// `GET /api/clients/me` — the widget's own SahajCloud service document, used to
// bootstrap its locale, theme colors, and home region. `region` resolves to a
// RegionRef at depth=1; `allowedDomains` is a newline-separated list.
//
// `legacyConfig` is gone (#153). SahajCloud removed the field rather than promoting
// it: a hand-maintained `routing_type`/`embed_type` beside what the widget now
// *observes* is a second, contradictory source for the same facts, and the legacy
// values are wrong in the field — `sahajayoga.at` is recorded as `script` while
// serving an iframe. That is the whole argument for `src/loader/detect.ts`.
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
})
export type Client = z.infer<typeof ClientSchema>
