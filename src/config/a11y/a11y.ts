import type { TranslationTree } from '@/types'

import en from './en.json'

/**
 * The screen-reader strings: the one set of UI copy this repo owns.
 *
 * Every string a sighted viewer reads comes from SahajCloud's `sy-atlas-translations`. A string
 * that is only ever spoken — an `aria-label`, an `sr-only` span, a live-region announcement —
 * lives here instead, in `<locale>.json`, machine-translated by whoever adds it. Translators never
 * see these, and adding one needs no SahajCloud change.
 *
 * Each file holds `<group>.<key>`, mounted at `<group>.a11y.<key>`, so `t('calendar.a11y.next')`
 * reads one exactly as it reads a SahajCloud string. The rule is the path: a key with an `a11y`
 * segment comes from here, and SahajCloud declares none.
 */
export type A11yStrings = typeof en

/** The English strings, mounted into the boot resource (`config/i18n.ts`). */
export const EN_A11Y: A11yStrings = en

/** What the strings add to a bundle once mounted, for `i18next.d.ts`. */
export type MountedA11y = { [Group in keyof A11yStrings]: { a11y: A11yStrings[Group] } }

/** Mounts one locale's strings at `<group>.a11y`, keeping each group's SahajCloud keys. */
export function withA11y(bundle: TranslationTree, strings: TranslationTree): TranslationTree {
  const result: TranslationTree = { ...bundle }

  for (const [group, keys] of Object.entries(strings)) {
    const host = bundle[group]

    result[group] = { ...(typeof host === 'object' ? host : {}), a11y: keys }
  }

  return result
}

/**
 * ⚠ **Lazy, one chunk per locale.** The eager payload is budgeted (`pnpm size`), and a viewer
 * needs one language's strings, so only English ships in the entry. `en` and `context` are
 * excluded: the first is already eager, the second is for translators, not the bundle.
 */
const LOCALE_FILES = import.meta.glob<TranslationTree>(
  ['./*.json', '!./en.json', '!./context.json'],
  {
    import: 'default',
  },
)

/** The file for a locale: its own, else its base tag's (`de-AT` → `de`), else none. */
export function a11yFileFor(locale: string): (() => Promise<TranslationTree>) | undefined {
  return LOCALE_FILES[`./${locale}.json`] ?? LOCALE_FILES[`./${locale.split('-')[0]}.json`]
}

/**
 * One locale's strings. English — and any locale without a file — answers the English set, and a
 * key a file lacks falls back to it through i18next's `fallbackLng`.
 */
export async function loadA11yStrings(locale: string): Promise<TranslationTree> {
  const load = a11yFileFor(locale)

  return load ? load() : EN_A11Y
}
