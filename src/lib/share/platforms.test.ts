import { describe, it, expect } from 'vitest'

import {
  DEFAULT_PLATFORMS,
  PLATFORMS_BY_COUNTRY,
  platformsForCountry,
  type PlatformKey,
} from './platforms'

const VALID_KEYS = new Set<PlatformKey>([
  'whatsapp',
  'telegram',
  'facebook',
  'x',
  'linkedin',
  'reddit',
  'email',
  'vk',
  'ok',
  'line',
  'viber',
  'weibo',
])

describe('platformsForCountry', () => {
  it('orders seeded regions by their dominant platforms', () => {
    // The acceptance-criteria spot checks: RU→VK/OK/Telegram, JP→LINE, IN→WhatsApp, US→X/Facebook.
    expect(platformsForCountry('RU').slice(0, 3)).toEqual(['vk', 'ok', 'telegram'])
    expect(platformsForCountry('JP')[0]).toBe('line')
    expect(platformsForCountry('IN')[0]).toBe('whatsapp')
    expect(platformsForCountry('US').slice(0, 2)).toEqual(['x', 'facebook'])
  })

  it('is case-insensitive', () => {
    expect(platformsForCountry('ru')).toEqual(platformsForCountry('RU'))
    expect(platformsForCountry('Jp')).toEqual(PLATFORMS_BY_COUNTRY.JP)
  })

  it('falls back to DEFAULT_PLATFORMS for unknown, empty, or absent codes', () => {
    expect(platformsForCountry('ZZ')).toBe(DEFAULT_PLATFORMS)
    expect(platformsForCountry('')).toBe(DEFAULT_PLATFORMS)
    expect(platformsForCountry(undefined)).toBe(DEFAULT_PLATFORMS)
    expect(platformsForCountry(null)).toBe(DEFAULT_PLATFORMS)
  })

  it('seeds every country with a non-empty list of valid platform keys', () => {
    for (const [country, list] of Object.entries(PLATFORMS_BY_COUNTRY)) {
      expect(list.length, `${country} has no platforms`).toBeGreaterThan(0)
      for (const platform of list) {
        expect(
          VALID_KEYS.has(platform),
          `${country} references unknown platform "${platform}"`,
        ).toBe(true)
      }
    }
  })
})
