import { describe, expect, it } from 'vitest'

import { directionsUrl, isAppleMobile } from './events'

describe('directionsUrl', () => {
  const coords = { latitude: 51.5, longitude: -0.12 }
  const text = { street: '1 High St', city: 'Leeds' }

  it('sends Apple devices to Apple Maps and everyone else to Google, for coordinates', () => {
    expect(directionsUrl(coords, true)).toBe('https://maps.apple.com/?daddr=51.5,-0.12')
    expect(directionsUrl(coords, false)).toBe(
      'https://www.google.com/maps/search/?api=1&query=51.5,-0.12',
    )
  })

  it('does the same for address text, encoded', () => {
    expect(directionsUrl(text, true)).toBe('https://maps.apple.com/?daddr=1%20High%20St%2C%20Leeds')
    expect(directionsUrl(text, false)).toBe(
      'https://www.google.com/maps/search/?api=1&query=1%20High%20St%2C%20Leeds',
    )
  })

  it('has nothing to point at without coordinates or text', () => {
    expect(directionsUrl({}, true)).toBeUndefined()
    expect(directionsUrl(null, false)).toBeUndefined()
  })
})

describe('isAppleMobile', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

  it('spots an iPhone, and an iPad reporting itself as a Mac', () => {
    expect(isAppleMobile({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true)
    expect(isAppleMobile({ userAgent: MAC, maxTouchPoints: 5 })).toBe(true)
  })

  it('leaves a real Mac and an Android phone on Google Maps', () => {
    expect(isAppleMobile({ userAgent: MAC, maxTouchPoints: 0 })).toBe(false)
    expect(isAppleMobile({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false)
  })

  it('answers false with no navigator at all', () => {
    expect(isAppleMobile(undefined)).toBe(false)
  })
})
