import { describe, expect, it, vi } from 'vitest'

import { MAP_WORLDVIEWS, mapWorldview, syncMapLanguage } from './map-language'

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

describe('mapWorldview', () => {
  it('gives a Japanese locale the JP worldview', () => {
    // `useLocale` hands the map `locale.split('-')[0]`, and i18next's code for Japanese is `ja`.
    expect(mapWorldview('ja')).toBe('JP')
  })

  it('falls back to the default for a language with no worldview of its own', () => {
    expect(mapWorldview('fr')).toBe(MAP_WORLDVIEWS.default)
  })

  it('is keyed by language codes, never by a country code written in their place', () => {
    // A key no locale can produce is silent: the lookup misses and the default answers. ICU hands
    // back the code itself when it names no language, which is what a country code such as `jp`
    // does.
    const languages = new Intl.DisplayNames('en', { type: 'language' })
    const keys = Object.keys(MAP_WORLDVIEWS).filter((key) => key !== 'default')
    const unnamed = keys.filter((key) => languages.of(key) === key)

    expect(keys.length).toBeGreaterThan(0)
    expect(unnamed).toEqual([])
  })
})
