import { describe, expect, it } from 'vitest'

import { directionsUrl } from './events'

describe('directionsUrl', () => {
  const coords = { latitude: 51.5, longitude: -0.12 }
  const text = { street: '1 High St', city: 'Leeds' }

  it('sends iPhones and iPads to Apple Maps and everyone else to Google, for coordinates', () => {
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
