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

  it('always appends email as the final option, exactly once', () => {
    for (const code of ['RU', 'JP', 'US', 'ZZ', undefined]) {
      const list = platformsForCountry(code)

      expect(list.at(-1)).toBe('email')
      expect(list.filter((platform) => platform === 'email')).toHaveLength(1)
    }
  })

  it('is case-insensitive', () => {
    expect(platformsForCountry('ru')).toEqual(platformsForCountry('RU'))
    expect(platformsForCountry('Jp')).toEqual([...PLATFORMS_BY_COUNTRY.JP, 'email'])
  })

  it('falls back to the default set (+ email) for unknown, empty, or absent codes', () => {
    const fallback = [...DEFAULT_PLATFORMS, 'email']

    expect(platformsForCountry('ZZ')).toEqual(fallback)
    expect(platformsForCountry('')).toEqual(fallback)
    expect(platformsForCountry(undefined)).toEqual(fallback)
    expect(platformsForCountry(null)).toEqual(fallback)
  })

  it('keeps email out of the stored lists (it is appended, not listed)', () => {
    expect(DEFAULT_PLATFORMS).not.toContain('email')
    for (const [country, list] of Object.entries(PLATFORMS_BY_COUNTRY)) {
      expect(list, `${country} should not list email`).not.toContain('email')
    }
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

  it('stays within a single six-icon row for every region (incl. the appended email)', () => {
    for (const code of [undefined, ...Object.keys(PLATFORMS_BY_COUNTRY)]) {
      expect(
        platformsForCountry(code).length,
        `${code ?? 'default'} exceeds one row`,
      ).toBeLessThanOrEqual(6)
    }
  })
})
