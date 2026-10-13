import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// `public/_headers` is inert text until Cloudflare reads it out of a build output, so the
// smoke lane is where its EFFECT is observed. This spec holds the one rule that must be
// true before a deploy: no two rules may set the same header name on the same path.
//
// Both platforms apply every matching rule and join a repeated value with a comma, so two
// rules setting `Access-Control-Allow-Origin` serve `*, *` — invalid, and the #91 font
// failure again. #279 lifted CORS to a single `/*` rule for exactly that reason.
//
// The smoke lane cannot be the mechanism for this, and saying it was is what this spec
// replaces. `cache-headers.smoke.test.ts` and `robots.smoke.test.ts` read ACAO on
// `/auto.js` and `/embed.js` only, they run post-deploy, they skip without a preview, and
// they read the Pages app — never the Worker, the one platform where a missing or invalid
// ACAO is fatal rather than cosmetic. A collision added to `/assets/*`, the likeliest edit
// because that rule used to carry the header, would be observed by none of them.
//
// `cache-headers.smoke.test.ts:18` states the principle this spec exists to honour: a
// comment stating an intention is not a mechanism.

const HEADERS = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

type Rule = { pattern: string; headers: string[] }

/**
 * `public/_headers` as a list of rules: an unindented line opening with `/` is a pattern,
 * and the indented `Name: value` lines under it are its headers.
 */
export function parseRules(text: string): Rule[] {
  const rules: Rule[] = []

  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue

    if (line.startsWith('/')) {
      rules.push({ pattern: line.trim(), headers: [] })
      continue
    }

    const name = /^\s+([A-Za-z0-9-]+):/.exec(line)?.[1]

    if (name) rules.at(-1)?.headers.push(name.toLowerCase())
  }

  return rules
}

/**
 * Whether two patterns can match one path. Decidable only for the shapes this file uses —
 * a literal path, or a prefix ending in `*`. `assertDecidable` refuses anything else
 * rather than answering wrongly.
 */
export function overlaps(a: string, b: string): boolean {
  const [globA, globB] = [a.endsWith('*'), b.endsWith('*')]
  const [prefixA, prefixB] = [a.replace(/\*$/, ''), b.replace(/\*$/, '')]

  if (globA && globB) return prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)
  if (globA) return b.startsWith(prefixA)
  if (globB) return a.startsWith(prefixB)

  return a === b
}

describe('public/_headers', () => {
  const rules = parseRules(HEADERS)

  // Vacuity guards. Every assertion below passes on an empty parse, so a reformat that
  // breaks the parser would turn the whole spec green — the failure `docs/testing.md`
  // calls the hardest kind to notice. These pin what the file is known to contain.
  it('parses the rules it is known to carry', () => {
    expect(rules.map((rule) => rule.pattern)).toEqual(
      expect.arrayContaining(['/assets/*', '/auto.js', '/embed.js', '/*']),
    )
    expect(rules.length).toBeGreaterThanOrEqual(4)
    expect(rules.every((rule) => rule.headers.length > 0)).toBe(true)
  })

  // `overlaps` answers for a literal path or a trailing-`*` prefix. A `*` in the middle,
  // or Cloudflare's `:placeholder`, would make it answer wrongly — so fail instead.
  it('uses only pattern shapes the overlap check can decide', () => {
    for (const { pattern } of rules) {
      expect(pattern, `${pattern} is not a literal path or a trailing-* prefix`).toMatch(
        /^\/[^*:]*\*?$/,
      )
    }
  })

  it('never sets one header name on two patterns that can match the same path', () => {
    const collisions: string[] = []

    for (const [i, rule] of rules.entries()) {
      for (const other of rules.slice(i + 1)) {
        if (!overlaps(rule.pattern, other.pattern)) continue

        for (const name of rule.headers.filter((n) => other.headers.includes(n))) {
          collisions.push(`${name} on both ${rule.pattern} and ${other.pattern}`)
        }
      }
    }

    // The message names the consequence, not the rule: a reader who hits this needs to
    // know the value is comma-joined, not that a spec disagrees with them.
    expect(
      collisions,
      `Cloudflare joins a repeated header value with a comma, so each of these serves "<value>, <value>": ${collisions.join('; ')}`,
    ).toEqual([])
  })

  // The acceptance criterion #279 is held to: every path readable cross-origin, by one
  // rule. The collision spec above forbids a second; this one forbids zero, and forbids
  // the single rule covering less than the whole site.
  it('makes every path readable cross-origin from exactly one rule', () => {
    const cors = rules.filter((rule) => rule.headers.includes('access-control-allow-origin'))

    expect(cors.map((rule) => rule.pattern)).toEqual(['/*'])
  })
})
