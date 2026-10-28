import type { GeocodingFeature, GeocodingFeatureContextComponent } from '@mapbox/search-js-core'
import type { Position } from 'geojson'
import type { EventAddress, ProposalLocation } from '@/types'

import { compact } from './shared'

import { geocodeCountryCode } from '@/lib/geocode'

/**
 * The place a listing is anchored to, in the two ways the flow can learn one: picked from the
 * geocoder, or read back off a published class.
 */

/**
 * A geocoded place, captured at the moment it is picked. The ids are taken from the retrieve
 * rather than re-geocoded later: the sender needs the place's own id and the `place`, `region`
 * and `country` layers above it, and only that feature carries all four.
 */
export type PickedPlace = {
  /** The picked feature's own id — an address's goes in `proposed.address.mapboxId`. */
  mapboxId?: string
  /** One line naming the place, as the geocoder showed it. */
  label: string
  street?: string
  postCode?: string
  city?: string
  /** ISO 3166-2 subdivision, the Events address group's `region`. */
  region?: string
  /** ISO 3166-1 alpha-2. */
  country?: string
  latitude?: number
  longitude?: number
  /** The layers above the place, for intake to match to a region. */
  location: ProposalLocation
}

/**
 * The region context entry, widened the way `geocodeCountryCode` widens the country one: the
 * API returns `region_code_full` (ISO 3166-2), the vendor type does not declare it.
 */
type RegionContext = GeocodingFeatureContextComponent & { region_code_full?: string }

/**
 * A retrieved feature, as the flow keeps it.
 *
 * A feature names its OWN layer by its own id, and the layers above it in `context`. So a
 * picked city is its own `placeId`, and a picked address takes its `placeId` from context.
 */
export const featureToPlace = (feature: GeocodingFeature): PickedPlace => {
  const properties = feature.properties
  const context = properties?.context ?? {}
  const type = properties?.feature_type
  const own = (layer: string, entry?: { mapbox_id?: string }) =>
    type === layer ? properties?.mapbox_id : entry?.mapbox_id
  const region: RegionContext | undefined = context.region
  const [longitude, latitude] = feature.geometry?.coordinates ?? []

  return {
    mapboxId: properties?.mapbox_id,
    label: properties?.full_address || properties?.name || '',
    street: type === 'address' ? properties?.name : context.address?.name,
    postCode: context.postcode?.name,
    city: type === 'place' ? properties?.name : (context.place?.name ?? context.locality?.name),
    region: region?.region_code_full,
    country: geocodeCountryCode(feature),
    latitude: properties?.coordinates?.latitude ?? latitude,
    longitude: properties?.coordinates?.longitude ?? longitude,
    location: compact({
      placeId: own('place', context.place),
      regionId: own('region', context.region),
      countryId: own('country', context.country),
    }),
  }
}

/**
 * Where a place search starts: the region the flow opened over. A map-less embed has no camera
 * to bias the geocoder, so the region's own centre is the only answer that holds everywhere.
 */
export const searchProximity = (
  center: Position | null | undefined,
): { lng: number; lat: number } | undefined =>
  center && center.length >= 2 ? { lng: center[0], lat: center[1] } : undefined

/** The place a published class's stored address reads as, for a correction's base draft. */
export const placeFromAddress = (address: EventAddress): PickedPlace => ({
  mapboxId: address.mapboxId ?? undefined,
  label: [address.street, address.city].filter(Boolean).join(', '),
  street: address.street ?? undefined,
  postCode: address.postCode ?? undefined,
  city: address.city ?? undefined,
  region: address.region ?? undefined,
  country: address.country ?? undefined,
  latitude: address.latitude ?? undefined,
  longitude: address.longitude ?? undefined,
  location: {},
})
