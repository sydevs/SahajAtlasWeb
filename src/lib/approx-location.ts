import z from 'zod'

/**
 * The visitor's approximate location, from Cloudflare's reading of their IP, written into
 * `loader.js` (or the standalone page) by the app Worker (`worker/geo.mjs`). Coarse: a city and
 * its centre, good for "classes near Prague", never for a doorstep.
 */
export type ApproxLocation = {
  /** ISO alpha-2, upper case. */
  countryCode?: string
  /** A guessed town, with the point a search centres on. */
  place?: { city: string; center: [number, number] }
}

/**
 * How old a written location may be. The Worker writes a fresh one on every request, so an old
 * one means a copy: a host plugin that saved `loader.js` onto its own domain would otherwise
 * hand one visitor's town to everyone. Wide enough for a device clock that is somewhat wrong.
 */
export const APPROX_LOCATION_MAX_AGE_MS = 30 * 60 * 1000

// Bounded again here: the Worker validates, but this parses whatever text reached the page.
const PayloadSchema = z.object({
  v: z.literal(1),
  t: z.number(),
  cc: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .catch(undefined),
  city: z.string().min(1).max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
})

const decodeBase64Url = (token: string): string => {
  const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'))

  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

/**
 * The location a written token carries, or `null` for the build's untouched placeholder, a
 * malformed or stale token, or one that names nothing. Never throws.
 */
export function decodeApproxLocation(
  token: string | null | undefined,
  nowMs: number,
): ApproxLocation | null {
  if (!token) return null

  try {
    const parsed = PayloadSchema.safeParse(JSON.parse(decodeBase64Url(token)))

    if (!parsed.success) return null

    const { t, cc, city, lat, lon } = parsed.data

    if (Math.abs(nowMs - t * 1000) > APPROX_LOCATION_MAX_AGE_MS) return null

    const place =
      city && lat !== undefined && lon !== undefined
        ? { city, center: [lon, lat] as [number, number] }
        : undefined

    if (!cc && !place) return null

    return { ...(cc && { countryCode: cc }), ...(place && { place }) }
  } catch {
    return null
  }
}
