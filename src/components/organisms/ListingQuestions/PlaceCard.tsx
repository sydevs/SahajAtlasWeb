import type { PickedPlace } from '@/lib/proposal'
import type { ReactNode } from 'react'

import { useState } from 'react'
import { MapPin } from 'lucide-react'

/** The live map's selected-pin orange, as the Static Images API wants it (hex, no `#`). */
const PIN_COLOR = 'e8704f'
/** The live map's light style (`MAP_STYLES.light` in `Mapbox/Map.tsx`), so the two look alike. */
const STYLE = 'sydevadmin/ck7g6nag70rn11io09f45odkq'

/**
 * A still map of a picked place. On a phone the flow's sheet covers the live map, so this is
 * the only way the visitor sees where their class will show — and a map-less embed has no live
 * map at all.
 */
const staticMapUrl = (longitude: number, latitude: number) => {
  const point = `${longitude.toFixed(5)},${latitude.toFixed(5)}`

  return `https://api.mapbox.com/styles/v1/${STYLE}/static/pin-l+${PIN_COLOR}(${point})/${point},15/600x240@2x?access_token=${import.meta.env.VITE_MAPBOX_ACCESSTOKEN}`
}

/** The picked place, as the visitor confirms it: a map of the pin over the address. */
export function PlaceCard({ place, action }: { place: PickedPlace; action?: ReactNode }) {
  const [mapFailed, setMapFailed] = useState(false)
  const hasPoint = place.latitude !== undefined && place.longitude !== undefined

  return (
    <div className="overflow-hidden rounded-xl border border-gray-6">
      {hasPoint && !mapFailed && (
        <img
          alt={place.label}
          className="block aspect-[5/2] w-full bg-gray-3 object-cover"
          loading="lazy"
          src={staticMapUrl(place.longitude!, place.latitude!)}
          onError={() => setMapFailed(true)}
        />
      )}
      <div className="flex items-start gap-3 px-4 py-3">
        <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-11" />
        <p className="min-w-0 flex-1 text-base leading-snug font-medium break-words">
          {place.label}
        </p>
        {action}
      </div>
    </div>
  )
}
