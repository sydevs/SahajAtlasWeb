import { describe, expect, it, vi } from 'vitest'

import { LOCALE_PARAM, localeHref, pageLocaleOverride, publishLocale } from './locale-param'

import { supportedLanguages } from '@/config/i18n-options'

const HOST = 'https://example.org/classes'

describe('LOCALE_PARAM', () => {
  // It is the one definition, imported by `config/i18n-options.ts` for `lookupQuerystring`. If
  // the two ever diverged, the widget would write a parameter nothing reads — silently.
  it('is the name the detector reads', () => {
    expect(LOCALE_PARAM).toBe('locale')
  })
})

describe('localeHref', () => {
  it('writes the locale onto the page URL', () => {
    expect(localeHref(HOST, 'nl')).toBe(`${HOST}?locale=nl`)
  })

  // The widget's route lives in `?atlas=`, and the host owns everything else on their own URL.
  // Publishing a language must disturb neither.
  it('preserves the widget route and the host own parameters', () => {
    const url = new URL(localeHref(`${HOST}?p=123&atlas=%2Fgb%2Flondon&utm=x`, 'fr'))

    expect(url.searchParams.get('atlas')).toBe('/gb/london')
    expect(url.searchParams.get('p')).toBe('123')
    expect(url.searchParams.get('utm')).toBe('x')
    expect(url.searchParams.get('locale')).toBe('fr')
  })

  it('replaces an existing locale rather than appending a second', () => {
    const url = new URL(localeHref(`${HOST}?locale=fr`, 'ru'))

    expect(url.searchParams.getAll('locale')).toEqual(['ru'])
  })

  it('keeps the path and the fragment, which are the host own', () => {
    const url = new URL(localeHref(`${HOST}/deep/page#section`, 'de'))

    expect(url.pathname).toBe('/classes/deep/page')
    expect(url.hash).toBe('#section')
  })

  it('returns an empty string for a URL that will not parse', () => {
    expect(localeHref('not a url', 'de')).toBe('')
  })
})

describe('publishLocale', () => {
  const fakeWindow = (href: string, state: unknown = { __sy_atlas: { key: 'abc', idx: 2 } }) => {
    const replaceState = vi.fn()

    return {
      replaceState,
      win: { location: { href }, history: { state, replaceState } } as unknown as Window,
    }
  }

  it('replaces the entry rather than pushing one — a language is not a place', () => {
    const { win, replaceState } = fakeWindow(HOST)

    publishLocale('nl', win)

    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState.mock.calls[0][2]).toBe(`${HOST}?locale=nl`)
  })

  // The atlas history namespaces its entry key and depth under `history.state`. Dropping them
  // would make the drawer's next X climb to the structural parent instead of going back, and
  // would strand the camera snapshot taken against that key.
  it('passes history.state through untouched', () => {
    const state = { __sy_atlas: { key: 'abc', idx: 2 }, hostOwn: true }
    const { win, replaceState } = fakeWindow(HOST, state)

    publishLocale('nl', win)

    expect(replaceState.mock.calls[0][0]).toBe(state)
  })

  it('writes nothing when the URL already says so', () => {
    const { win, replaceState } = fakeWindow(`${HOST}?locale=nl`)

    publishLocale('nl', win)

    expect(replaceState).not.toHaveBeenCalled()
  })

  it('does not throw where the document refuses replaceState', () => {
    const win = {
      location: { href: HOST },
      history: {
        state: null,
        replaceState: () => {
          throw new Error('blocked')
        },
      },
    } as unknown as Window

    expect(() => publishLocale('nl', win)).not.toThrow()
  })
})

describe('pageLocaleOverride', () => {
  const override = (search: string) => pageLocaleOverride(search, supportedLanguages)

  it('is undefined when the page names no language', () => {
    expect(override('')).toBeUndefined()
    expect(override('?atlas=/gb/london')).toBeUndefined()
    expect(override('?locale=')).toBeUndefined()
    expect(override('?locale=%20')).toBeUndefined()
  })

  it('accepts a language the widget actually ships', () => {
    expect(override('?locale=fr')).toBe('fr')
    expect(override('?locale=ru')).toBe('ru')
  })

  it('resolves a regional tag by its base, the way i18next does', () => {
    expect(override('?locale=de-DE')).toBe('de')
    expect(override('?locale=pt-BR')).toBe('pt-BR')
  })

  // The load-bearing rejection. An unshipped code falls back to English via `supportedLngs`, so
  // treating its mere presence as a viewer's choice would suppress a host's own `locale=fr` in
  // favour of English — worse than either party asked for.
  it('rejects a language the widget does not ship, rather than counting it as a choice', () => {
    expect(override('?locale=zz')).toBeUndefined()
    expect(override('?locale=klingon')).toBeUndefined()
  })
})
