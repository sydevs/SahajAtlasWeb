/**
 * A small picture of the map at one point, from the Mapbox Static Images API, in the atlas's own
 * light style. The add-a-class flow shows it under a picked address — on a phone the sheet covers
 * the live map, and "is this the right place?" needs a map to answer.
 */

/** The atlas's light map style, as `owner/id` — the one `Map.tsx` loads as `mapbox://styles/…`. */
const STYLE = 'sydevadmin/ck7g6nag70rn11io09f45odkq'

/** The selected-pin coral (`POINT_SELECTED_FILL` in `components/organisms/Mapbox/markers.ts`), so
 *  the picture's pin reads as the one on the live map. Mapbox's own wordmark and attribution stay
 *  on the picture, as its terms ask. */
const PIN = 'e0775c'

export const staticMapUrl = ({
  longitude,
  latitude,
  width,
  height,
  zoom = 15,
  token = import.meta.env.VITE_MAPBOX_ACCESSTOKEN,
}: {
  longitude: number
  latitude: number
  width: number
  height: number
  zoom?: number
  token?: string
}): string | null => {
  if (!token) return null

  const at = `${longitude.toFixed(5)},${latitude.toFixed(5)}`

  return (
    `https://api.mapbox.com/styles/v1/${STYLE}/static/pin-l+${PIN}(${at})/${at},${zoom},0/` +
    `${Math.round(width)}x${Math.round(height)}@2x?access_token=${encodeURIComponent(token)}`
  )
}
