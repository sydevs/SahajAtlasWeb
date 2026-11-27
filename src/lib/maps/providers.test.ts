import { describe, expect, it } from 'vitest'

import { directionsHref, mapProvidersForCountry } from './providers'

const coords = { latitude: 51.5, longitude: -0.12 }
const text = { street: '1 High St', city: 'Leeds' }

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
    const cn = mapProvidersForCountry('CN', false)

    expect(cn.slice(0, 2)).toEqual(['amap', 'baidu'])
    expect(cn.at(-1)).toBe('google')
  })
})

describe('directionsHref', () => {
  it('routes to coordinates', () => {
    expect(directionsHref('apple', coords)).toBe('https://maps.apple.com/?daddr=51.5,-0.12')
    expect(directionsHref('google', coords)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=51.5,-0.12',
    )
    expect(directionsHref('yandex', coords)).toBe(
      'https://yandex.com/maps/?rtext=~51.5,-0.12&rtt=auto',
    )
    expect(directionsHref('osm', coords)).toBe(
      'https://www.openstreetmap.org/directions?route=%3B51.5%2C-0.12',
    )
  })

  it('tells Amap and Baidu the coordinates are WGS84, longitude first for Amap', () => {
    expect(directionsHref('amap', coords, 'Hall')).toBe(
      'https://uri.amap.com/marker?position=-0.12,51.5&name=Hall&coordinate=wgs84',
    )
    expect(directionsHref('baidu', coords, 'Hall')).toContain('coord_type=wgs84')
  })

  it('falls back to address text, encoded', () => {
    expect(directionsHref('apple', text)).toBe(
      'https://maps.apple.com/?daddr=1%20High%20St%2C%20Leeds',
    )
    expect(directionsHref('waze', text)).toBe(
      'https://www.waze.com/ul?q=1%20High%20St%2C%20Leeds&navigate=yes',
    )
  })

  it('leaves out Kakao, Amap and Baidu without coordinates', () => {
    for (const provider of ['kakao', 'amap', 'baidu'] as const)
      expect(directionsHref(provider, text)).toBeUndefined()
  })

  it('has nothing to point at without coordinates or text', () => {
    expect(directionsHref('google', {})).toBeUndefined()
    expect(directionsHref('google', null)).toBeUndefined()
  })
})
