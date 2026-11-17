import { describe, expect, it, vi } from 'vitest'

import { syncMapLanguage } from './map-language'

const fakeMap = (language: string | undefined) => {
  const map = {
    language,
    getLanguage: vi.fn(() => map.language),
    setLanguage: vi.fn((next?: string) => {
      map.language = next
    }),
  }

  return map
}

describe('syncMapLanguage', () => {
  it('relabels the map when the locale has changed', () => {
    const map = fakeMap('en')

    expect(syncMapLanguage(map, 'fr')).toBe(true)
    expect(map.setLanguage).toHaveBeenCalledWith('fr')
    expect(map.language).toBe('fr')
  })

  it('leaves a map already in that language alone', () => {
    const map = fakeMap('fr')

    expect(syncMapLanguage(map, 'fr')).toBe(false)
    expect(map.setLanguage).not.toHaveBeenCalled()
  })

  it('sets the language on a map that was built with none', () => {
    const map = fakeMap(undefined)

    expect(syncMapLanguage(map, 'en')).toBe(true)
  })

  it('does nothing before the map exists', () => {
    expect(syncMapLanguage(undefined, 'fr')).toBe(false)
  })
})
