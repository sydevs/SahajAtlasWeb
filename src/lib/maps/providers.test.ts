import { describe, expect, it } from 'vitest'

import { type MapProviderKey, directionsLinks, mapProvidersForCountry } from './providers'

const coords = { latitude: 51.5, longitude: -0.12 }
const text = { street: '1 High St', city: 'Leeds' }

const href = (provider: MapProviderKey, address: object | null, label = '') =>
  directionsLinks([provider], address, label)[0]?.href

describe('mapProvidersForCountry', () => {
  it('leads with Google, then Apple, then Waze and OpenStreetMap', () => {
    expect(mapProvidersForCountry('GB', false)).toEqual(['google', 'apple', 'waze', 'osm'])
  })

  it('puts Apple Maps first on an iPhone or iPad', () => {
    expect(mapProvidersForCountry(undefined, true).slice(0, 2)).toEqual(['apple', 'google'])
  })

  it("leads with the viewer's regional service", () => {
    expect(mapProvidersForCountry('ru', false)[0]).toBe('yandex')
    expect(mapProvidersForCountry('KR', false)[0]).toBe('kakao')
  })

  it('sends Google to the end in China, where it does not load', () => {
    expect(mapProvidersForCountry('CN', false)).toEqual([
      'amap',
      'baidu',
      'apple',
      'waze',
      'osm',
      'google',
    ])
  })
})

describe('directionsLinks', () => {
  it('routes to coordinates', () => {
    expect(href('apple', coords)).toBe('https://maps.apple.com/?daddr=51.5,-0.12')
    expect(href('google', coords)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=51.5,-0.12',
    )
    expect(href('yandex', coords)).toBe('https://yandex.com/maps/?rtext=~51.5,-0.12&rtt=auto')
    expect(href('osm', coords)).toBe(
      'https://www.openstreetmap.org/directions?route=%3B51.5%2C-0.12',
    )
    expect(href('kakao', coords, 'Hall')).toBe('https://map.kakao.com/link/to/Hall,51.5,-0.12')
  })

  it('tells Amap and Baidu the coordinates are WGS84, longitude first for Amap', () => {
    expect(href('amap', coords, 'Hall')).toBe(
      'https://uri.amap.com/marker?position=-0.12,51.5&name=Hall&coordinate=wgs84',
    )
    expect(href('baidu', coords, 'Hall')).toContain('coord_type=wgs84')
  })

  it('falls back to address text, encoded, without saying the town twice', () => {
    expect(href('apple', text)).toBe('https://maps.apple.com/?daddr=1%20High%20St%2C%20Leeds')
    expect(href('waze', { street: '1 High St, Leeds', city: 'Leeds' })).toBe(
      'https://www.waze.com/ul?q=1%20High%20St%2C%20Leeds&navigate=yes',
    )
  })

  it('leaves out Kakao, Amap and Baidu without coordinates', () => {
    const rows = directionsLinks(['kakao', 'amap', 'baidu', 'osm'], text, '')

    expect(rows.map((row) => row.provider)).toEqual(['osm'])
  })

  it('has nothing to point at without coordinates or text', () => {
    expect(directionsLinks(['google'], {}, '')).toEqual([])
    expect(directionsLinks(['google'], null, '')).toEqual([])
  })
})
