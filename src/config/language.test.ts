import { describe, it, expect, vi, beforeEach } from 'vitest'

import { preferredLanguage } from './i18n-options'
import { applyLanguage, bootLanguage } from './language'

// The single writer's job is a SEQUENCE — fetch, write the resource, switch — so what this
// suite drives is two of them overlapping. Everything at the boundary is mocked: i18next (whose
// real instance boots a detector), the shared QueryClient, and the fetcher module (which pulls
// the SDK in). `preferredLanguage` is left real, because which locale each call resolves to is
// the input the ordering test depends on.
const {
  changeLanguage,
  addResourceBundle,
  detected,
  getQueryData,
  ensureQueryData,
  reportInternalError,
} = vi.hoisted(() => ({
  changeLanguage: vi.fn(async (_locale: string) => undefined),
  addResourceBundle: vi.fn(),
  // i18next's raw detected tag, which `bootLanguage` exists to stop trusting on its own.
  detected: { language: 'en-US' },
  getQueryData: vi.fn(),
  ensureQueryData: vi.fn(),
  reportInternalError: vi.fn(),
}))

vi.mock('./i18n', () => ({
  default: {
    changeLanguage,
    addResourceBundle,
    get language() {
      return detected.language
    },
  },
}))
vi.mock('./query-client', () => ({ queryClient: { getQueryData, ensureQueryData } }))
vi.mock('./api/fetch', () => ({
  translationsQuery: (locale: string) => ({ queryKey: ['translations', locale] }),
}))
vi.mock('@/lib/report', () => ({ reportInternalError }))

/** A bundle whose arrival the test, not the network, decides. */
const deferred = <T,>() => {
  let settle!: { resolve: (value: T) => void; reject: (error: unknown) => void }
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject }
  })

  // An unhandled rejection here would fail the run before the assertion does; `applyLanguage`
  // is the only consumer that matters.
  promise.catch(() => {})

  return { promise, ...settle }
}

/** Which locales `changeLanguage` was asked for, in the order it was asked. */
const switches = () => changeLanguage.mock.calls.map(([locale]) => locale)

beforeEach(() => {
  detected.language = 'en-US'
  changeLanguage.mockClear()
  addResourceBundle.mockClear()
  getQueryData.mockReset()
  ensureQueryData.mockReset()
  reportInternalError.mockClear()
})

describe('applyLanguage', () => {
  it('applies a cached bundle with no await in between', async () => {
    getQueryData.mockReturnValue({ common: { ok: 'Fine' } })

    await applyLanguage('fr', ['en', 'fr'])

    expect(ensureQueryData).not.toHaveBeenCalled()
    expect(addResourceBundle).toHaveBeenCalledWith(
      'fr',
      'translation',
      { common: { ok: 'Fine' } },
      true,
      true,
    )
    expect(switches()).toEqual(['fr'])
  })

  it('falls back to English when the bundle cannot be read', async () => {
    getQueryData.mockReturnValue(undefined)
    ensureQueryData.mockRejectedValue(new Error('502'))

    await applyLanguage('fr', ['en', 'fr'])

    expect(reportInternalError).toHaveBeenCalled()
    expect(switches()).toEqual(['en'])
  })

  // ── The two calls `AppShell` makes within one frame (#205 review) ─────────────────
  //
  // Its layout effect keys on the offered set, which answers `['en']` until `sy-atlas-config`
  // lands and the real set a beat later. So a `?locale=fr` page asks for English first and
  // French second, both in flight together, and the loser of that race is decided by which
  // read the network happens to answer last — not by which one was asked for last.

  it('ignores a bundle that a newer request has already superseded', async () => {
    const english = deferred<unknown>()
    const french = deferred<unknown>()

    getQueryData.mockReturnValue(undefined)
    ensureQueryData.mockImplementation(({ queryKey }: { queryKey: [string, string] }) =>
      queryKey[1] === 'fr' ? french.promise : english.promise,
    )

    // The first effect pass: the offered set is still the `['en']` floor, so `fr` narrows to
    // English. The second pass has the real set and resolves to French.
    const first = applyLanguage('fr', ['en'])
    const second = applyLanguage('fr', ['en', 'fr'])

    french.resolve({ common: { ok: 'Bien' } })
    english.resolve({ common: { ok: 'Fine' } })

    await Promise.all([first, second])

    expect(switches()).toEqual(['fr'])
  })

  it('does not drop a superseded request back to English when its read fails', async () => {
    const english = deferred<unknown>()
    const french = deferred<unknown>()

    getQueryData.mockReturnValue(undefined)
    ensureQueryData.mockImplementation(({ queryKey }: { queryKey: [string, string] }) =>
      queryKey[1] === 'fr' ? french.promise : english.promise,
    )

    const first = applyLanguage('fr', ['en'])
    const second = applyLanguage('fr', ['en', 'fr'])

    french.resolve({ common: { ok: 'Bien' } })
    english.reject(new Error('502'))

    await Promise.all([first, second])

    // Still reported — a failed read is worth knowing about whoever asked for it — but the
    // English fallback belongs to the request that is still current, and this one is not.
    expect(reportInternalError).toHaveBeenCalled()
    expect(switches()).toEqual(['fr'])
  })
})

// ── What the boot warm-up should fetch (#205 review) ────────────────────────────────
//
// The property under test is AGREEMENT: the key `warmTranslations` fills must be the key
// `applyLanguage` reads a beat later. Every case below picks values that differ from each
// other, so an implementation that simply returned one of its inputs fails rather than
// passing by coincidence.

describe('bootLanguage', () => {
  it('takes `?locale=` verbatim, over the attribute and the browser', () => {
    // Written by the widget itself out of the offered set, so it already names a published
    // locale — and `preferredLanguage` prefers an exact match to a base tag.
    detected.language = 'ru'

    expect(bootLanguage('?locale=pt-BR', 'de')).toBe('pt-BR')
  })

  it('falls through an empty `?locale=` to the host attribute', () => {
    detected.language = 'ru'

    expect(bootLanguage('?locale=%20&q=paris', 'de')).toBe('de')
  })

  it('base-tags the host attribute, which no detector reads', () => {
    detected.language = 'ru'

    expect(bootLanguage('?q=paris', 'de-DE')).toBe('de')
  })

  it('base-tags the browser tag when nothing else asks', () => {
    detected.language = 'en-US'

    expect(bootLanguage('')).toBe('en')
  })

  it('warms the key applyLanguage reads, in the two cases the raw tag missed', () => {
    // The whole point: a warm-up that disagrees with the effect pays for a request nobody
    // reads. Both of these resolved to `en-US` before, and neither is what gets applied.
    const offered = ['en', 'de', 'fr']

    detected.language = 'en-US'

    // A host passing `locale="fr"`. The attribute is in no detector.
    expect(bootLanguage('', 'fr')).toBe(preferredLanguage('fr', offered))

    // A browser reporting a regional tag, which `preferredLanguage` narrows to its base.
    expect(bootLanguage('')).toBe(preferredLanguage(detected.language, offered))
  })
})
