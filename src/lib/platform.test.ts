import { describe, expect, it } from 'vitest'

import { isIOSPlatform } from './platform'

describe('isIOSPlatform', () => {
  it('names every iOS device, and nothing else', () => {
    expect(isIOSPlatform('iPhone', 5)).toBe(true)
    expect(isIOSPlatform('iPad', 5)).toBe(true)
    expect(isIOSPlatform('iPod touch', 5)).toBe(true)
    // iPadOS 13 and later report a Mac. Touch support is what tells it from a desktop one.
    expect(isIOSPlatform('MacIntel', 5)).toBe(true)
    expect(isIOSPlatform('MacIntel', 0)).toBe(false)
    expect(isIOSPlatform('Linux armv8l', 5)).toBe(false)
    expect(isIOSPlatform('Win32', 0)).toBe(false)
    expect(isIOSPlatform('', 0)).toBe(false)
  })
})
