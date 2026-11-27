// Region-aware directions: which map services an event's Directions menu offers, and the link
// each one takes.
//
// No maintained web package covers this — the multi-provider libraries are React Native only
// (react-native-map-link) or stop at Google and Apple — so, like `share/platforms.ts`, this is
// hand-maintained. A viewer in Russia reaches for Yandex, one in Korea for Kakao, one in China for
// Amap or Baidu (Google is blocked there). Every other viewer gets the universal set.
// Kakao, Amap and Baidu were opened in a browser on 2026-11-27: each lands on the right spot from
// WGS84 coordinates. Their search pages found nothing for a Latin-script address, so without
// coordinates they are left out of the menu.

import type { EventAddress } from '@/types'

export type MapProviderKey =
  'google' | 'apple' | 'waze' | 'yandex' | 'kakao' | 'amap' | 'baidu' | 'osm'

/** Brand names, shown as written in every language. */
export const MAP_PROVIDER_NAMES: Record<MapProviderKey, string> = {
  google: 'Google Maps',
  apple: 'Apple Maps',
  waze: 'Waze',
  yandex: 'Yandex Maps',
  kakao: 'Kakao Map',
  amap: 'Amap',
  baidu: 'Baidu Maps',
  osm: 'OpenStreetMap',
}

const YANDEX: MapProviderKey[] = ['yandex']

// ISO alpha-2 (uppercase) to the regional services that lead the menu, most-used first.
export const MAP_PROVIDERS_BY_COUNTRY: Record<string, MapProviderKey[]> = {
  RU: YANDEX,
  BY: YANDEX,
  KZ: YANDEX,
  UZ: YANDEX,
  KG: YANDEX,
  TR: YANDEX,
  KR: ['kakao'],
  CN: ['amap', 'baidu'],
}

/**
 * The menu's services for a viewer: their region's first, then Apple Maps and Google Maps (Apple
 * first on an iPhone or iPad), then Waze, then OpenStreetMap. In China Google goes last, since it
 * does not load there.
 */
export function mapProvidersForCountry(
  country: string | undefined,
  apple: boolean,
): MapProviderKey[] {
  const regional = MAP_PROVIDERS_BY_COUNTRY[country?.toUpperCase() ?? ''] ?? []
  const pair: MapProviderKey[] = apple ? ['apple', 'google'] : ['google', 'apple']
  const universal: MapProviderKey[] = [...pair, 'waze', 'osm']
  const ordered = [...regional, ...universal.filter((key) => !regional.includes(key))]

  return country?.toUpperCase() === 'CN'
    ? [...ordered.filter((key) => key !== 'google'), 'google']
    : ordered
}

type Destination = { lat: number; lng: number } | { text: string }

const destinationOf = (address: EventAddress | null | undefined): Destination | undefined => {
  const { latitude, longitude, street, city, country } = address ?? {}

  if (latitude != null && longitude != null) return { lat: latitude, lng: longitude }

  const text = [street, city, country].filter(Boolean).join(', ')

  return text ? { text } : undefined
}

const enc = encodeURIComponent

/**
 * A directions link to `address` in one service, or undefined when there is nothing to point at.
 * Coordinates win over address text. Coordinates are WGS84 throughout: Amap and Baidu are told so,
 * since each defaults to China's own offset datum. Baidu shows a space in the name as `+`.
 */
export function directionsHref(
  provider: MapProviderKey,
  address: EventAddress | null | undefined,
  label = '',
): string | undefined {
  const to = destinationOf(address)

  if (!to) return undefined

  const name = enc(label || ('text' in to ? to.text : ''))

  if ('text' in to) {
    const q = enc(to.text)

    switch (provider) {
      case 'google':
        return `https://www.google.com/maps/dir/?api=1&destination=${q}`
      case 'apple':
        return `https://maps.apple.com/?daddr=${q}`
      case 'waze':
        return `https://www.waze.com/ul?q=${q}&navigate=yes`
      case 'yandex':
        return `https://yandex.com/maps/?text=${q}`
      case 'kakao':
      case 'amap':
      case 'baidu':
        return undefined
      case 'osm':
        return `https://www.openstreetmap.org/search?query=${q}`
    }
  }

  const { lat, lng } = to

  switch (provider) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    case 'apple':
      return `https://maps.apple.com/?daddr=${lat},${lng}`
    case 'waze':
      return `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`
    case 'yandex':
      return `https://yandex.com/maps/?rtext=~${lat},${lng}&rtt=auto`
    case 'kakao':
      return `https://map.kakao.com/link/to/${name || 'Destination'},${lat},${lng}`
    // The marker page, not navigation: navigation ignores `coordinate=wgs84` and lands ~500m off
    // in China's offset datum. The marker page converts, and offers a route from there.
    case 'amap':
      return `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}&coordinate=wgs84`
    case 'baidu':
      return `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${name}&content=${name}&coord_type=wgs84&output=html&src=webapp.sahajatlas`
    case 'osm':
      return `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lng}`
  }
}
