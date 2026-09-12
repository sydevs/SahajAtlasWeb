import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

import snapshot from './translations.en.json'
import { TRANSLATION_SELECT } from './api/fetch'

import { REGISTRATION_QUESTION_NAMES, WIDGET_TRANSLATION_TABS } from '@/types'
import { SORT_ORDERS, TIME_PERIODS } from '@/lib/shape'

/**
 * This replaces the bundle-parity gate `public/locales/` used to need (#198).
 *
 * The shape of the problem is the same, and so is the failure it prevents: a key a call site
 * asks for and the copy does not answer renders as its own dotted name, in front of a visitor,
 * with lint, typecheck and every other spec green. What changed is where the copy lives. The CMS
 * owns it now, and `src/config/translations.en.json` is the committed snapshot of it — so this
 * asserts the two directions that snapshot has to satisfy:
 *
 * - every key the source asks for RESOLVES in it, so nothing renders as a raw key; and
 * - every key it holds is ASKED FOR somewhere, so copy nobody can see does not accumulate in a
 *   CMS that translators are paid to fill in.
 *
 * ⚠ **The second direction is the one that needs the dynamic families spelled out.** A key built
 * at runtime — `filters.time.${period}`, a `messageKey` out of `ERROR_POLICY` — appears in no
 * literal, so a referenced-key sweep that only reads `t('…')` would call every one of them dead
 * and delete perfectly live copy. Each family below reads the OPTIONS out of the constant that
 * generates them, either by import or out of the source of the module that holds them, so
 * adding a filter format, a sort order or a registration question keeps the two sides in step
 * with no edit here. Only the fixed chrome each group also owns — its `label`, and the `any`
 * that clears it — is written down, because neither is an option in any of those tables.
 *
 * ⚠ **A table read out of source that stops matching goes vacuously green**, which is the one
 * way this file can lie. `derives each dynamic family from a table it actually found` below is
 * what stops that, so keep a new regex-read family listed there.
 */
const sourceDir = fileURLToPath(new URL('..', import.meta.url))

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`

    if (entry.isDirectory()) return sourceFiles(path)

    // The generated CMS types name every key as a TypeScript property, which would make the
    // referenced-key direction below vacuously true for all of them.
    if (path.includes('/types/payload/')) return []

    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })

const sources = sourceFiles(sourceDir).map((path) => readFileSync(path, 'utf8'))
const allSource = sources.join('\n')

const flatten = (node: unknown, prefix = ''): [string, unknown][] =>
  typeof node === 'object' && node !== null
    ? Object.entries(node).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`))
    : [[prefix.slice(0, -1), node]]

const entries = flatten(snapshot)
const keys = new Set(entries.map(([key]) => key))

/** A key the snapshot must answer, whether or not a literal in the source spells it out. */
const resolves = (key: string) => keys.has(key) || keys.has(`${key}_other`)

// ── The families a literal sweep cannot see ─────────────────────────────────────

const literalOptions = (source: string, name: string): string[] => {
  const table = new RegExp(`${name}[^{]*\\{([^}]*)\\}`, 's').exec(source)

  return table ? [...table[1].matchAll(/['"]([a-z_][a-zA-Z0-9_.]*)['"]/g)].map((m) => m[1]) : []
}

/**
 * The array form of the same idea, for a table written `= [...]` rather than `= {...}`.
 *
 * `CADENCE_OPTIONS` is why the literal class is not lower-case-only here: its members are the
 * CMS's own `DAILY` / `WEEKLY` spellings, which the call site lower-cases into the key.
 */
const arrayLiterals = (source: string, name: string): string[] => {
  const table = new RegExp(`${name}[^[]*\\[([^\\]]*)\\]`, 's').exec(source)

  return table ? [...table[1].matchAll(/['"]([A-Za-z_][a-zA-Z0-9_.]*)['"]/g)].map((m) => m[1]) : []
}

// `FORMAT_OPTIONS` and `CADENCE_OPTIONS` are module-local to the component that renders them —
// exporting a list only a spec reads would be the wrong trade — so they are read out of its
// source, the way `WEEK_NUMBERS` reads `use-event-display.ts`. `TIME_PERIODS` and `SORT_ORDERS`
// are already exported from `lib/shape`, so those import.
const filtersSource = readFileSync(
  `${sourceDir}/components/molecules/SearchFilters/SearchFilters.tsx`,
  'utf8',
)

const FORMATS = arrayLiterals(filtersSource, 'const FORMAT_OPTIONS[^=]*=')
const CADENCES = arrayLiterals(filtersSource, 'const CADENCE_OPTIONS[^=]*=').map((o) =>
  o.toLowerCase(),
)

const FILTER_OPTIONS = [
  ...['label', 'any', ...FORMATS].map((o) => `filters.format.${o}`),
  ...['label', 'any', ...CADENCES].map((o) => `filters.cadence.${o}`),
  ...['label', ...TIME_PERIODS].map((o) => `filters.time.${o}`),
]

const SORT_KEYS = ['label', ...SORT_ORDERS].map((o) => `search.sort.${o}`)

const QUESTIONS = REGISTRATION_QUESTION_NAMES.map((name) => `registration.questions.${name}`)

const WEEK_NUMBERS = literalOptions(
  readFileSync(`${sourceDir}/hooks/use-event-display.ts`, 'utf8'),
  'const WEEK_NUMBER_KEYS =',
)

const POLICY_KEYS = [...allSource.matchAll(/messageKey: '([a-z_][a-zA-Z0-9_.]*)'/g)].map(
  (match) => match[1],
)

const REFUSAL_KEYS = [
  ...['ReportIssueForm/ReportIssueForm', 'RegistrationForm/RegistrationForm'].flatMap((file) => {
    const source = readFileSync(`${sourceDir}/components/organisms/${file}.tsx`, 'utf8')

    return [
      ...literalOptions(source, 'const REFUSAL_MESSAGE_KEYS[^=]*='),
      ...literalOptions(source, 'const STATE_MESSAGE_KEYS[^=]*='),
    ]
  }),
]

const DYNAMIC_KEYS = [
  ...FILTER_OPTIONS,
  ...SORT_KEYS,
  ...QUESTIONS,
  ...WEEK_NUMBERS,
  ...POLICY_KEYS,
  ...REFUSAL_KEYS,
]

const LITERAL_KEYS = [...allSource.matchAll(/\bt\(\s*'([a-z_][a-zA-Z0-9_.]*)'/g)].map((m) => m[1])

describe('the English snapshot', () => {
  it('is not empty, and every value is a filled string', () => {
    // A blank value is the failure a key-name check cannot see: i18next resolves it, renders
    // nothing, and the control it labels becomes invisible or unnameable. `common.chrome.
    // widget_label` is the sharp case — WebKit drops the widget root's landmark role outright
    // when its accessible name resolves empty (#92).
    expect(entries.length).toBeGreaterThan(150)

    const blank = entries.filter(([, value]) => typeof value !== 'string' || !value.trim())

    expect(blank).toEqual([])
  })

  it('carries both English plural forms for the session count', () => {
    // i18next resolves `_one`/`_other` from `count`, never the bare key, so a snapshot holding
    // `sessions_count` alone would render a raw key on every course card.
    expect(keys.has('event.display.sessions_count_one')).toBe(true)
    expect(keys.has('event.display.sessions_count_other')).toBe(true)
    expect(keys.has('event.display.sessions_count')).toBe(false)
  })

  it('holds no key from the two groups the widget must not fetch', () => {
    // `emails` is the registrant mail SahajCloud sends, and `event.title` its auto-titles.
    // Both hold live production data with no widget surface, so neither is selected, synced, or
    // shipped in a public bundle.
    expect([...keys].filter((key) => key.startsWith('emails.'))).toEqual([])
    expect([...keys].filter((key) => key.startsWith('event.title.'))).toEqual([])
  })
})

describe('the tab list the widget reads', () => {
  it('is the same list in the type, the select, and the sync script', () => {
    // Three statements, in three places that cannot import one another: the constant, the SDK
    // `select` (which must stay a literal for its own type-check), and a node script with no
    // compiler. Before this, adding a tab to one left the others silently behind — the sync
    // script fetches everything and strips, so a group the CMS added reached the snapshot
    // without ever being requested at runtime.
    expect(Object.keys(TRANSLATION_SELECT).sort()).toEqual([...WIDGET_TRANSLATION_TABS].sort())

    const script = readFileSync(`${sourceDir}/../scripts/sync-translations.mjs`, 'utf8')
    const tabs = arrayLiterals(script, 'const WIDGET_TABS[^=]*=')

    expect(tabs.sort()).toEqual([...WIDGET_TRANSLATION_TABS].sort())
  })
})

describe('every key a call site asks for', () => {
  it('derives each dynamic family from a table it actually found', () => {
    // A regex that stops matching — a constant renamed, a table reformatted — returns `[]`, and
    // every assertion below it then passes for a reason that has nothing to do with the copy.
    // The sharp case is `DYNAMIC_KEYS` clearing its own floor on the strength of the families
    // that still match, while a silently empty one covers nothing at all.
    //
    // Emptiness is the whole assertion. Pinning the CONTENTS here would put the hand-written
    // list back, one file over from the one it was just taken out of.
    for (const [name, family] of Object.entries({
      FORMATS,
      CADENCES,
      WEEK_NUMBERS,
      REFUSAL_KEYS,
      POLICY_KEYS,
    })) {
      expect(family, `${name} read no table — its regex no longer matches the source`).not.toEqual(
        [],
      )
    }
  })

  it('resolves in the snapshot, for a literal key', () => {
    expect(LITERAL_KEYS.length).toBeGreaterThan(100)

    expect(LITERAL_KEYS.filter((key) => !resolves(key))).toEqual([])
  })

  it('resolves in the snapshot, for a key built at runtime', () => {
    // These are derived from the constants that generate them, so a new filter option or
    // registration question fails here rather than rendering its own key.
    expect(DYNAMIC_KEYS.length).toBeGreaterThan(30)

    expect(DYNAMIC_KEYS.filter((key) => !resolves(key))).toEqual([])
  })
})

describe('every key the snapshot holds', () => {
  it('is referenced somewhere in the source', () => {
    // The other direction: copy nobody renders is copy translators are asked to fill in for
    // nothing. A key dropped from the app but left in the CMS shows up here.
    // Quoted ANYWHERE in the source, not only inside a `t()` call: a key can legitimately be
    // held in a constant and handed to `t` elsewhere (`use-event-display`'s register label,
    // every `messageKey`). This direction asks whether the copy is reachable at all, so the
    // weaker test is the right one — the stricter direction above is what catches a typo.
    const quoted = [...allSource.matchAll(/['"]([a-z_][a-zA-Z0-9_.]*)['"]/g)].map((m) => m[1])

    const referenced = new Set([...LITERAL_KEYS, ...DYNAMIC_KEYS, ...quoted])

    const dead = [...keys].filter((key) => {
      const logical = key.replace(/_(one|few|many|other)$/, '')

      return !referenced.has(key) && !referenced.has(logical)
    })

    expect(dead, 'in the snapshot, referenced by nothing — drop it in SahajCloud').toEqual([])
  })
})
