import z from 'zod'

/**
 * The visitor's approximate location, from Cloudflare's reading of their IP: the default export
 * of `/geo.js`, which the app Worker builds per visitor (`worker/geo.mjs`). Coarse — a town and
 * its centre, good for "classes near Prague", never for a doorstep.
 */
export type ApproxLocation = {
  /** ISO alpha-2, upper case. */
  countryCode?: string
  /** A guessed town, with the point a search centres on, `[lng, lat]`. */
  place?: { city: string; center: [number, number] }
}

// Bounded again here: the Worker validates, but this parses whatever a module import returned.
// Each field fails alone, so a bad town still keeps a good country.
const ApproxLocationSchema = z.object({
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  place: z
    .object({
      city: z.string().min(1).max(100),
      center: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
    })
    .optional()
    .catch(undefined),
})

/** The location a module export carries, or `null` for anything that names nothing. Never throws. */
export function parseApproxLocation(value: unknown): ApproxLocation | null {
  const parsed = ApproxLocationSchema.safeParse(value)

  if (!parsed.success) return null

  const { countryCode, place } = parsed.data

  if (!countryCode && !place) return null

  return { ...(countryCode && { countryCode }), ...(place && { place }) }
}
