import { describe, expect, it } from 'vitest'

import { nativeLanguageLabel } from './use-locale'

import { supportedLanguages } from '@/config/i18n-options'

// This suite does not exercise the hook itself, since it needs a React tree and an i18next instance.
// This covers the pure label helper beside it, where the reported bug lived.
// The picker rendered every option through the ACTIVE locale's `Intl.DisplayNames`.
// So a French visitor hunting for English was offered "anglais."

describe('nativeLanguageLabel', () => {
  it('names each language in itself', () => {
    expect(nativeLanguageLabel('en')).toBe('English')
    expect(nativeLanguageLabel('fr')).toBe('français')
    expect(nativeLanguageLabel('de')).toBe('Deutsch')
    expect(nativeLanguageLabel('ru')).toBe('русский')
    expect(nativeLanguageLabel('uk')).toBe('українська')
  })

  it('handles a regional tag', () => {
    expect(nativeLanguageLabel('pt-BR')).toBe('português (Brasil)')
  })

  // This is the property that actually distinguishes this from the old behavior.
  // The answer must not depend on what language is currently on screen.
  // A helper reading the active locale would pass every assertion above while the app ran in English, and fail nobody in CI.
  it('does not vary with the active locale', () => {
    // `Intl.DisplayNames('fr')` renders these as tchèque, allemand, anglais.
    // The endonyms below are what the picker must show, whichever language the widget is currently in.
    expect(nativeLanguageLabel('cs')).toBe('čeština')
    expect(nativeLanguageLabel('cs')).not.toBe('tchèque')
    expect(nativeLanguageLabel('nl')).toBe('Nederlands')
    expect(nativeLanguageLabel('nl')).not.toBe('néerlandais')
  })

  it('returns a non-empty label for every language the picker offers', () => {
    for (const code of supportedLanguages) {
      expect(nativeLanguageLabel(code).length).toBeGreaterThan(0)
    }
  })

  // This renders inside a menu that must not be able to blank the widget.
  // `Intl.DisplayNames` throws on a malformed code, from the constructor as well as from `.of`.
  it('falls back to the raw code rather than throwing', () => {
    expect(nativeLanguageLabel('not a language tag')).toBe('not a language tag')
    expect(nativeLanguageLabel('')).toBe('')
  })
})
