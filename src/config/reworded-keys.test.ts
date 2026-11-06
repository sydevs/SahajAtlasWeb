import i18next from 'i18next'
import { describe, expect, it } from 'vitest'

import snapshot from './translations.en.json'
import { REWORDED_KEYS, rewordedKey } from './reworded-keys'

/**
 * A real i18next instance, set up the way the widget's is: the snapshot is English, and each
 * SahajCloud bundle is merged over what a locale holds (`applyBundle`). French here is what
 * SahajCloud serves today: the old keys, translated, and none of the new ones.
 */
const setup = async (french: object) => {
  const i18n = i18next.createInstance()

  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: snapshot }, fr: { translation: french } },
    interpolation: { prefix: '%{', suffix: '}', escapeValue: false },
  })

  return i18n
}

const FRENCH_TODAY = {
  common: { errors: { no_events: 'Aucun événement trouvé.' } },
  search: { results: { showing: '%{shown} sur %{total} événements affichés' } },
}

describe('rewordedKey', () => {
  it('reads the new key in English, even after SahajCloud’s English lands over the snapshot', async () => {
    const i18n = await setup(FRENCH_TODAY)

    i18n.addResourceBundle(
      'en',
      'translation',
      { common: { errors: { no_events: 'No events found.' } } },
      true,
      true,
    )

    expect(i18n.t(rewordedKey(i18n, 'common.errors.no_classes'))).toBe('No classes found.')
  })

  it('keeps another language’s translation of the old key, rather than falling back to English', async () => {
    const i18n = await setup(FRENCH_TODAY)

    await i18n.changeLanguage('fr')

    expect(i18n.t(rewordedKey(i18n, 'common.errors.no_classes'))).toBe('Aucun événement trouvé.')
    expect(
      i18n.t(rewordedKey(i18n, 'search.results.showing_classes'), { shown: 25, total: 419 }),
    ).toBe('25 sur 419 événements affichés')
  })

  it('switches to the new key once SahajCloud ships it in that language', async () => {
    const i18n = await setup({
      ...FRENCH_TODAY,
      common: { errors: { no_events: 'Aucun événement trouvé.', no_classes: 'Aucun cours.' } },
    })

    await i18n.changeLanguage('fr')

    expect(i18n.t(rewordedKey(i18n, 'common.errors.no_classes'))).toBe('Aucun cours.')
  })

  it('passes any other key through untouched', async () => {
    const i18n = await setup(FRENCH_TODAY)

    await i18n.changeLanguage('fr')

    expect(rewordedKey(i18n, 'search.results.more')).toBe('search.results.more')
    expect(rewordedKey(i18n, 'toString')).toBe('toString')
  })

  it('keeps the new key for a stub with no resource store', () => {
    expect(rewordedKey({ resolvedLanguage: 'en' }, 'common.errors.no_classes')).toBe(
      'common.errors.no_classes',
    )
  })
})

describe('REWORDED_KEYS', () => {
  const resolves = (key: string) =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], snapshot)

  it('names two different keys per entry, both in the snapshot', () => {
    for (const [reworded, original] of Object.entries(REWORDED_KEYS)) {
      expect(reworded).not.toBe(original)
      expect(typeof resolves(reworded), reworded).toBe('string')
      expect(typeof resolves(original), original).toBe('string')
    }
  })
})
