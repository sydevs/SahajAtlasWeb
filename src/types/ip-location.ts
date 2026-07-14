import z from 'zod'

// A resolved IP-geolocation guess behind the "events near you" suggestion, parsed
// at the boundary from the third-party lookup (ipwho.is). An unresolved or
// country-only response fails this parse — no coordinates, or an empty `city`
// (`min(1)`) — so the suggestion simply doesn't render. `country` is the display
// name, paired with `city` for the search query label.
export const IpLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  city: z.string().min(1),
  country: z.string().min(1),
})

export type IpLocation = z.infer<typeof IpLocationSchema>
