import z from 'zod'

// A resolved IP-geolocation guess behind the "events near you" suggestion, parsed
// at the boundary from the third-party lookup (ipwho.is). An unresolved or
// country-only response fails this parse — no coordinates, or an empty `city`
// (`min(1)`) — so the suggestion simply doesn't render. `country` is the display
// name, paired with `city` for the search query label.
// Bounded at the trust boundary: ipwho.is is untrusted, so reject out-of-range
// coordinates and cap the strings (a hostile/compromised response can't push a
// multi-megabyte `city` into the banner text or the `/search` URL).
export const IpLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  // ISO alpha-2 country code (e.g. "RU", "JP") used to order an event's share
  // targets to the viewer's region (see `platformsForCountry`). Optional and
  // self-healing: `.catch(undefined)` keeps a missing or malformed code from
  // failing the whole parse — that would also drop the "events near you"
  // suggestion, which needs only the coordinates + city, not the code.
  country_code: z.string().length(2).optional().catch(undefined),
})

export type IpLocation = z.infer<typeof IpLocationSchema>
