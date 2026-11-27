// Region-aware directions: which map services an event's Directions menu offers, and the link
// each one takes.
//
// No maintained web package covers this — the multi-provider libraries are React Native only
// (react-native-map-link) or stop at Google and Apple — so, like `share/platforms.ts`, this is
// hand-maintained. A viewer in Russia reaches for Yandex, one in Korea for Kakao, one in China for
// Amap or Baidu (Google is blocked there). Every other viewer gets the universal set.
//
// Kakao, Amap and Baidu were opened in a browser on 2026-11-27: each lands on the right spot from
// WGS84 coordinates. Their search pages found nothing for a Latin-script address, so without
// coordinates they are left out of the menu.

import type { EventAddress } from '@/types'

import { streetAndCity } from '@/lib/shape/event'

type Coordinates = { lat: number; lng: number }

const enc = encodeURIComponent

type Provider = {
  /** The brand name, shown as written in every language. */
  name: string
  /** A route to coordinates. `label` is the place's name, for the services that show one. */
  at: (to: Coordinates, label: string) => string
  /** A route to, or a search for, address text. Absent where the service finds none. */
  text?: (query: string) => string
}

const PROVIDERS = {
  google: {
    name: 'Google Maps',
    at: ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    text: (q) => `https://www.google.com/maps/dir/?api=1&destination=${enc(q)}`,
  },
  apple: {
    name: 'Apple Maps',
    at: ({ lat, lng }) => `https://maps.apple.com/?daddr=${lat},${lng}`,
    text: (q) => `https://maps.apple.com/?daddr=${enc(q)}`,
  },
  waze: {
    name: 'Waze',
    at: ({ lat, lng }) => `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    text: (q) => `https://www.waze.com/ul?q=${enc(q)}&navigate=yes`,
  },
  yandex: {
    name: 'Yandex Maps',
    at: ({ lat, lng }) => `https://yandex.com/maps/?rtext=~${lat},${lng}&rtt=auto`,
    text: (q) => `https://yandex.com/maps/?text=${enc(q)}`,
  },
  kakao: {
    name: 'Kakao Map',
    at: ({ lat, lng }, label) => `https://map.kakao.com/link/to/${enc(label)},${lat},${lng}`,
  },
  // Amap and Baidu default to China's offset datums, so each is told the coordinates are WGS84.
  // Amap's marker page, not its navigation one: navigation ignores `coordinate=wgs84` and lands
  // ~500m off. The marker page converts, and offers a route from there.
  amap: {
    name: 'Amap',
    at: ({ lat, lng }, label) =>
      `https://uri.amap.com/marker?position=${lng},${lat}&name=${enc(label)}&coordinate=wgs84`,
  },
  // Baidu shows a space in the name as `+`.
  baidu: {
    name: 'Baidu Maps',
    at: ({ lat, lng }, label) =>
      `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${enc(label)}&content=${enc(label)}&coord_type=wgs84&output=html&src=webapp.sahajatlas`,
  },
  osm: {
    name: 'OpenStreetMap',
    at: ({ lat, lng }) => `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lng}`,
    text: (q) => `https://www.openstreetmap.org/search?query=${enc(q)}`,
  },
} satisfies Record<string, Provider>

export type MapProviderKey = keyof typeof PROVIDERS

// ISO alpha-2 (uppercase) to the regional services that lead the menu, most-used first.
const BY_COUNTRY: Record<string, MapProviderKey[]> = {
  RU: ['yandex'],
  BY: ['yandex'],
  KZ: ['yandex'],
  UZ: ['yandex'],
  KG: ['yandex'],
  TR: ['yandex'],
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
  const code = country?.toUpperCase() ?? ''
  const pair: MapProviderKey[] = apple ? ['apple', 'google'] : ['google', 'apple']
  const universal: MapProviderKey[] = [...pair, 'waze', 'osm']

  return code === 'CN'
    ? [...BY_COUNTRY.CN, ...universal.filter((key) => key !== 'google'), 'google']
    : [...(BY_COUNTRY[code] ?? []), ...universal]
}

export type DirectionsLink = { provider: MapProviderKey; name: string; href: string }

/**
 * The Directions menu's rows for `address`, in `providers`' order: empty when there is nothing to
 * point at. Coordinates win over address text.
 */
export function directionsLinks(
  providers: MapProviderKey[],
  address: EventAddress | null | undefined,
  label: string,
): DirectionsLink[] {
  const { latitude, longitude, street, city, country } = address ?? {}
  const at = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null
  const query = [streetAndCity(street, city), country].filter(Boolean).join(', ')

  return providers.flatMap((provider) => {
    const { name, ...service }: Provider = PROVIDERS[provider]
    const href = at ? service.at(at, label) : query && service.text?.(query)

    return href ? [{ provider, name, href }] : []
  })
}
