import type { Config } from '@/types/payload/payload-types'
import type { TranslationTree } from '@/types'

import { describe, expect, it } from 'vitest'

import snapshot from '../translations.en.json'

import { EN_A11Y, loadA11yStrings, withA11y } from './a11y'
import context from './context.json'

/**
 * The screen-reader files are machine-translated by whoever adds a key, with no translator to
 * catch a gap. These checks are the review: every SahajCloud locale has a file, and every file
 * has every English key with the English placeholders.
 */

/**
 * Every locale SahajCloud defines bar the English ones, as a type-checked set: a locale added
 * upstream fails `pnpm typecheck` here until its file exists and is listed.
 */
const TRANSLATED: Record<Exclude<Config['locale'], 'en' | 'en-AU'>, true> = {
  bg: true,
  cs: true,
  de: true,
  el: true,
  es: true,
  fa: true,
  fr: true,
  hu: true,
  hy: true,
  it: true,
  nl: true,
  pl: true,
  'pt-BR': true,
  ro: true,
  ru: true,
  tr: true,
  uk: true,
}

const FILES = import.meta.glob<TranslationTree>(['./*.json', '!./en.json', '!./context.json'], {
  eager: true,
  import: 'default',
})

const files = Object.entries(FILES).map(
  ([path, file]) => [path.replace(/^\.\/|\.json$/g, ''), file] as const,
)

const flatten = (node: unknown, prefix = ''): [string, string][] =>
  typeof node === 'object' && node !== null
    ? Object.entries(node).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`))
    : [[prefix.slice(0, -1), String(node)]]

const english = new Map(flatten(EN_A11Y))

const placeholders = (value: string) =>
  [...value.matchAll(/%\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join()

describe('the screen-reader files', () => {
  it('cover every locale SahajCloud defines, and nothing else', () => {
    expect(files.map(([locale]) => locale).sort()).toEqual(Object.keys(TRANSLATED).sort())
  })

  it.each(files)('%s holds every English key and no other', (_locale, file) => {
    expect(
      flatten(file)
        .map(([key]) => key)
        .sort(),
    ).toEqual([...english.keys()].sort())
  })

  it.each(files)(
    "%s keeps each English key's placeholders, and fills every value",
    (_locale, file) => {
      const wrong = flatten(file).filter(
        ([key, value]) =>
          value.trim() === '' ||
          value.trim() !== value ||
          placeholders(value) !== placeholders(english.get(key) ?? ''),
      )

      expect(wrong).toEqual([])
    },
  )

  it('describe every English key for the next translator', () => {
    expect(
      flatten(context)
        .map(([key]) => key)
        .sort(),
    ).toEqual([...english.keys()].sort())
    expect(flatten(context).filter(([, text]) => text.trim() === '')).toEqual([])
  })

  it('leave the SahajCloud snapshot without an a11y group', () => {
    // The boundary: a string only a screen reader speaks lives here, never upstream.
    expect(flatten(snapshot).filter(([key]) => key.split('.').includes('a11y'))).toEqual([])
  })
})

describe('loadA11yStrings', () => {
  it('answers English for a locale without a file', async () => {
    expect(await loadA11yStrings('en-AU')).toBe(EN_A11Y)
    expect(await loadA11yStrings('xx')).toBe(EN_A11Y)
  })

  it("answers a locale's own file", async () => {
    expect(await loadA11yStrings('fr')).toBe(FILES['./fr.json'])
    expect(await loadA11yStrings('pt-BR')).toBe(FILES['./pt-BR.json'])
  })
})

describe('withA11y', () => {
  it("mounts the strings under each group and keeps the group's SahajCloud keys", () => {
    const bundle = withA11y({ calendar: { title: 'Calendar' } }, { calendar: { next: 'Next' } })

    expect(bundle).toEqual({ calendar: { title: 'Calendar', a11y: { next: 'Next' } } })
  })

  it('gives a group the bundle lacks its a11y strings alone', () => {
    expect(withA11y({}, { share: { copy_link: 'Copy link' } })).toEqual({
      share: { a11y: { copy_link: 'Copy link' } },
    })
  })
})
