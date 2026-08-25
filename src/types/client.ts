import z from 'zod'

import { RegionRefSchema } from './region-ref'

// `GET /api/clients/me` — the widget's own SahajCloud service document, used to
// bootstrap its theme colors and home region.
//
// ⚠ **`locale` is deliberately absent.** SahajCloud still has the field; the widget stopped
// reading it, because the language should follow the PAGE (`<html lang>`) rather than a
// record-level setting that says it once for every page a client embeds on. Removing it from the
// schema as well as the `select` is what stops it quietly coming back. `region` resolves to a
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
  color1: z.string().nullish(),
  color2: z.string().nullish(),
  color3: z.string().nullish(),
  allowedDomains: z.string().nullish(),
  clientId: z.string().nullish(),
  region: z.union([RegionRefSchema, z.number(), z.null()]).optional(),
  /**
   * Canonical ownership (SahajCloud #635). The widget reads exactly one thing from it: `embed`,
   * the mount key naming the page whose URLs this client owns, which is where `routing=path`
   * gets its prefix (`mountPrefix`, `lib/shape/routing.ts`).
   *
   * ⚠ **Everything here is nullish on purpose, including the group.** Canonical ownership is off
   * by default, `embed` is only required once it is switched on, and a client key may not be
   * granted the field at all. Path routing degrades to query with a console warning in every one
   * of those cases, so a missing field must parse rather than fail the whole client read — which
   * would blank the widget over a feature it is not using.
   */
  canonical: z
    .object({
      enabled: z.boolean().nullish(),
      embed: z.string().nullish(),
    })
    .nullish(),
})
export type Client = z.infer<typeof ClientSchema>
