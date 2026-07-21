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
  // The state/province the IP resolves to — coarser than `city`, which the
  // lookup often reports at neighbourhood level ("Riley Park"). Used — reconciled
  // against `timezone` — to name the viewer's clock in an online event's time
  // conversion. Optional: not every response carries one, and a missing region
  // must not fail the parse (that would take the nearby suggestion down with it).
  region: z.string().max(100).optional(),
  // The IANA zone ipwho.is resolves the IP to (nested `timezone.id`, e.g.
  // "America/Vancouver"). Captured to reconcile the `region` label against the
  // viewer's OS clock: the region is named only when this zone shares the OS
  // offset for the instant shown, else the converted time shows bare (issue #64)
  // — so the label never asserts a place whose local time isn't the one displayed.
  // `.partial().nullish()` so a missing or id-less timezone degrades to that safe
  // form instead of failing the parse (which would take the suggestion down too).
  timezone: z
    .object({ id: z.string().max(100) })
    .partial()
    .nullish(),
  country: z.string().min(1).max(100),
  // ISO alpha-2 country code (e.g. "RU", "JP") used to order an event's share
  // targets to the viewer's region (see `platformsForCountry`). Optional and
  // self-healing: `.catch(undefined)` keeps a missing or malformed code from
  // failing the whole parse — that would also drop the "events near you"
  // suggestion, which needs only the coordinates + city, not the code.
  country_code: z.string().length(2).optional().catch(undefined),
})

export type IpLocation = z.infer<typeof IpLocationSchema>
