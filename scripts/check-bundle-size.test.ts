import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import {
  BUDGET_KIB,
  SENTRY_GAP_KIB,
  eagerGraphs,
  hasDebugIds,
  htmlGraph,
  importClosure,
  score,
  staticImports,
} from './check-bundle-size.mjs'

/**
 * A build with no Sentry token emits none of the per-chunk debug-ID snippet
 * production ships, so the files on disk are not the files a visitor downloads.
 * These cases pin that the verdicts read the shipped figure, and that a build
 * already carrying the snippet is not charged for it twice. #413 is the
 * incident: a graph 1.0 KiB inside its budget as measured shipped 0.2 KiB over.
 */
describe('score', () => {
  // Half a gap inside the budget as measured, half a gap outside it as shipped
  // — #413's shape, expressed against whatever the budget is today rather than
  // the 334 it was then.
  it('fails a graph whose shipped size is over budget though its measured size is not', () => {
    const embed = score('embed', BUDGET_KIB.embed - SENTRY_GAP_KIB.embed / 2)

    expect(embed.kib).toBeLessThan(embed.budget)
    expect(embed.shipped).toBeGreaterThan(embed.budget)
    expect(embed.over).toBe(true)
  })

  it('passes a graph inside its budget in shipped terms', () => {
    expect(score('embed', 333.003)).toMatchObject({ over: false, under: false })
  })

  // 3.224 is the loader graph of a credentialed build, 0.34 KiB inside its
  // budget. Charged the gap a second time it reads 3.72 and fails.
  it('adds no gap to a build that already emitted the snippet', () => {
    expect(score('loader', 3.224, true)).toMatchObject({ shipped: 3.224, over: false })
  })

  // 2.759 sits 0.84 KiB under the 3.6 budget — past the 15% the ratchet
  // allows — while the 3.26 it ships sits 0.34 under it. A ratchet reading
  // the measured figure would demand a budget production is already over.
  it('ratchets on the shipped figure, not the measured one', () => {
    expect(score('loader', 2.759).under).toBe(false)
  })

  it('still ratchets a graph that really shrank', () => {
    expect(score('loader', 2.0).under).toBe(true)
  })

  it('refuses a graph with no budget rather than scoring it as NaN', () => {
    expect(() => score('ghost', 1)).toThrow(/BUDGET_KIB/)
  })

  // What keeps score()'s own SENTRY_GAP_KIB guard unreachable. An ungapped
  // graph would score `NaN`, which fails every comparison the script makes.
  it('gaps every graph it budgets', () => {
    expect(Object.keys(SENTRY_GAP_KIB).sort()).toEqual(Object.keys(BUDGET_KIB).sort())
  })
})

/** Drives the detection over an in-memory graph. */
const detect = (files: Record<string, string>) =>
  hasDebugIds(Object.keys(files), (name: string) => files[name])

// A chunk shaped like the real output, so a passing case is not vacuously empty.
const CHUNK = 'import{a as e}from"./shared-BcnT2Sen.js";const t=()=>e();export{t};'
const INJECTED = `${CHUNK}var _sentryDebugIdIdentifier="sentry-dbid-8f2a";`

describe('hasDebugIds', () => {
  it('reads a build that emitted no snippet as uncredentialed', () => {
    expect(detect({ 'embed.js': CHUNK, 'assets/shared-BcnT2Sen.js': CHUNK })).toBe(false)
  })

  it('reads a build whose every chunk carries the snippet as credentialed', () => {
    expect(detect({ 'embed.js': INJECTED, 'assets/shared-BcnT2Sen.js': INJECTED })).toBe(true)
  })

  // The plugin injects into every chunk, so one plain chunk means this `dist/`
  // holds output from two builds. Reading it as credentialed would score the
  // gap at zero on a payload that ships it — #413's under-charge again.
  it('reads a graph mixing injected and plain chunks as uncredentialed', () => {
    expect(detect({ 'embed.js': INJECTED, 'assets/shared-BcnT2Sen.js': CHUNK })).toBe(false)
  })

  // `[].every()` is true, so the guard rather than the predicate is what keeps
  // an empty graph off the credentialed branch.
  it('reads an empty graph as uncredentialed', () => {
    expect(detect({})).toBe(false)
  })

  // The SDK's own lookup table spells `_sentryDebugIds`, and every build emits
  // it. Matching that instead would call an uncredentialed graph credentialed
  // and score its gap at zero — the #413 under-charge, restored silently.
  it('is not fooled by the SDK’s own debug-id lookup code', () => {
    const sdk = `${CHUNK}const i=globalThis._sentryDebugIds||{};`

    expect(detect({ 'assets/prod-CZrrz76r.js': sdk })).toBe(false)
  })
})

/**
 * What counts as the eager payload is decided by regexes over a bundler's output, so a walker
 * that stops matching scores a smaller graph and says nothing. These builds are written in the
 * shapes `dist/` holds (vite 8.3.8, rolldown 1.2.19): a minified static import has no space
 * before its quote, a dynamic one is a template literal, and the preload list names every lazy
 * chunk as a quoted string a careless walker would count.
 */
const MAIN = 'assets/main-BbhIzGzF.js'
const RUNTIME = 'assets/rolldown-runtime-BWaJ3C7D.js'
const HELPER = 'assets/preload-helper-7y9sWmk5.js'
const SHEET = 'assets/sheet-BSYtLEmB.js'
const LAZY = 'assets/CalendarView-IdZs4xkT.js'
const MAPBOX = 'assets/mapbox-gl-n4GIISfo.js'

const mapDeps = (...deps: string[]) =>
  `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=${JSON.stringify(deps)})))=>i.map(i=>d[i]);\n`

const shell = (...tags: string[]) =>
  `<!doctype html>\n<html class="sy-atlas">\n  <head>\n    ${tags.join('\n    ')}\n  </head>\n</html>\n`

const entryTag = `<script type="module" crossorigin src="/${MAIN}"></script>`
const hint = (file: string) => `<link rel="modulepreload" crossorigin href="/${file}">`

/** A build every refusal accepts, so each case below differs from it by one file. */
const BUILD: Record<string, string> = {
  'index.html': shell(entryTag, hint(RUNTIME), hint(SHEET), hint(HELPER)),
  [MAIN]:
    'import{a as e}from"./rolldown-runtime-BWaJ3C7D.js";import{t}from"./sheet-BSYtLEmB.js";e(t());',
  [SHEET]:
    mapDeps(LAZY, MAPBOX) +
    'import{a as e}from"./rolldown-runtime-BWaJ3C7D.js";import{t}from"./preload-helper-7y9sWmk5.js";' +
    'var n=()=>t(()=>import(`./CalendarView-IdZs4xkT.js`),__vite__mapDeps([0,1]));export{e as a,n as t};',
  [LAZY]:
    'import{t as e}from"./sheet-BSYtLEmB.js";import"./mapbox-gl-n4GIISfo.js";export{e as default};',
  [MAPBOX]: 'export default{};',
  [RUNTIME]: 'var e=e=>e;export{e as a};',
  [HELPER]: 'var e=(e,t)=>e();export{e as t};',
  'embed.js':
    'import{a as e}from"./assets/rolldown-runtime-BWaJ3C7D.js";import{t}from"./assets/sheet-BSYtLEmB.js";' +
    'var n=()=>e(t());export{n as boot};',
  'loader.js':
    mapDeps('embed.js', RUNTIME, SHEET, HELPER) +
    'import{t as e}from"./assets/preload-helper-7y9sWmk5.js";' +
    'e(async()=>{let{boot:e}=await import(`./embed.js`);return{boot:e}},__vite__mapDeps([0,1,2,3]));',
  'auto.js':
    '(()=>{let e=document.createElement(`script`);e.type=`module`,document.head.appendChild(e)})();',
}

const roots: string[] = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** Writes BUILD, with `changes` over it, under a fresh directory. `null` leaves a file out. */
const build = (changes: Record<string, string | null> = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'check-bundle-size-'))
  const dist = join(root, 'dist')

  roots.push(root)

  for (const [name, text] of Object.entries({ ...BUILD, ...changes })) {
    if (text === null) continue

    mkdirSync(dirname(join(dist, name)), { recursive: true })
    writeFileSync(join(dist, name), text)
  }

  return dist
}

/** The graphs of a build the gate accepts. A refusal throws, so no case passes on one. */
const graphsOf = (dist: string) => {
  const eager = eagerGraphs(dist)

  if ('failure' in eager) throw new Error(eager.failure)

  const names = (files: string[]) => files.map((file) => relative(dist, file))

  return {
    declared: names(eager.declared),
    loaded: names(eager.loaded).sort(),
    embed: names(eager.embedGraph).sort(),
    loader: names(eager.loaderGraph),
  }
}

const failureOf = (dist: string) => {
  const eager = eagerGraphs(dist)

  return 'failure' in eager ? eager.failure : undefined
}

describe('eagerGraphs', () => {
  it('reads the entry and its modulepreload closure off the shell', () => {
    const { declared, loaded } = graphsOf(build())

    expect(declared).toEqual([MAIN, RUNTIME, SHEET, HELPER])
    expect(loaded).toEqual([MAIN, HELPER, RUNTIME, SHEET])
  })

  it('walks the embed and loader entries, which no shell declares', () => {
    const { embed, loader } = graphsOf(build())

    expect(embed).toEqual([HELPER, RUNTIME, SHEET, 'embed.js'])
    expect(loader).toEqual(['auto.js', 'loader.js', HELPER])
  })

  // Scoring the union is what keeps a dropped hint from shrinking the payload on paper.
  it('counts a chunk the entry reaches that the shell does not hint', () => {
    const { declared, loaded } = graphsOf(
      build({ 'index.html': shell(entryTag, hint(RUNTIME), hint(SHEET)) }),
    )

    expect(declared).not.toContain(HELPER)
    expect(loaded).toContain(HELPER)
  })

  it('leaves a dynamic import, and what only it reaches, out of every graph', () => {
    const { declared, loaded, embed, loader } = graphsOf(build())
    const counted = [...declared, ...loaded, ...embed, ...loader]

    // The preload list is what would give a looser walker both chunks.
    expect(BUILD[SHEET]).toContain(`"${LAZY}","${MAPBOX}"`)
    expect(counted).not.toContain(LAZY)
    expect(counted).not.toContain(MAPBOX)
  })

  // The other half of that case: the same two chunks are counted the moment one static edge
  // reaches them, the second through a bare side-effect import.
  it('counts that chunk, and its own imports, once anything imports it statically', () => {
    const { embed } = graphsOf(build({ 'embed.js': `${BUILD['embed.js']}\nimport "./${LAZY}";\n` }))

    expect(embed).toEqual([LAZY, MAPBOX, HELPER, RUNTIME, SHEET, 'embed.js'].sort())
  })

  it('refuses a loader that imports the widget statically', () => {
    const dist = build({ 'loader.js': `import"./embed.js";${BUILD['loader.js']}` })

    expect(failureOf(dist)).toMatch(/^loader\.js statically imports embed\.js/)
  })

  // #153: the shared chunk costs no bytes worth a budget, and a request on every page view.
  it('refuses a chunk both the loader and the embed import', () => {
    const seam = 'assets/element-D57HVKgI.js'
    const dist = build({
      [seam]: 'var e=`sahaj-atlas`;export{e as t};',
      'loader.js': `import{t as n}from"./${seam}";${BUILD['loader.js']}`,
      'embed.js': `import{t as r}from"./${seam}";${BUILD['embed.js']}`,
    })

    expect(failureOf(dist)).toMatch(
      /^loader\.js and embed\.js share 1 chunk\(s\) — element-D57HVKgI\.js\. /,
    )
  })

  it('lets both entries carry the bundler’s own helpers', () => {
    const dist = build({
      'loader.js': `import{a as n}from"./${RUNTIME}";${BUILD['loader.js']}`,
    })
    const { embed, loader } = graphsOf(dist)

    // Both are in both graphs, so the exemption is what let this build through.
    expect(loader).toEqual(expect.arrayContaining([RUNTIME, HELPER]))
    expect(embed).toEqual(expect.arrayContaining([RUNTIME, HELPER]))
  })

  // The exemption goes by file name. A bundler that renames its helper trips the refusal, and
  // the message has to say that is one of the two things it can mean.
  it('refuses a shared helper under a name it does not know, and says how to admit it', () => {
    const renamed = 'assets/vite-preload-7y9sWmk5.js'
    const dist = build({
      [HELPER]: null,
      [renamed]: BUILD[HELPER],
      [SHEET]: BUILD[SHEET].replace('./preload-helper-7y9sWmk5.js', './vite-preload-7y9sWmk5.js'),
      'loader.js': BUILD['loader.js'].replace(`./${HELPER}`, `./${renamed}`),
      'index.html': shell(entryTag, hint(RUNTIME), hint(SHEET), hint(renamed)),
    })

    expect(failureOf(dist)).toMatch(
      /share 1 chunk\(s\) — vite-preload-7y9sWmk5\.js\. .*add the new name to BUNDLER_HELPER/,
    )
  })

  it('names an entry the build did not emit', () => {
    expect(failureOf(build({ 'embed.js': null, 'auto.js': null }))).toMatch(
      /found no build output at embed\.js, auto\.js /,
    )
  })

  // A walker that matches nothing scores one small file and reports a comfortable pass.
  it.each([
    ['embed.js', 'embed.js'],
    ['index.html', MAIN],
  ])('refuses a graph of one file, for %s', (entry, file) => {
    const blind = BUILD[file].replace(/from"/g, 'from`').replace(/\.js"/g, '.js`')

    expect(blind).not.toBe(BUILD[file])
    expect(failureOf(build({ [file]: blind }))).toMatch(
      new RegExp(`^Import walker found no chunks for ${entry.replace('.', '\\.')} `),
    )
  })

  it('refuses a shell that declares nothing it can read', () => {
    const dist = build({
      'index.html': shell('<script src="https://cdn.example/app.js"></script>'),
    })

    expect(failureOf(dist)).toMatch(/^Found no entry script in dist\/index\.html/)
  })
})

describe('staticImports', () => {
  it('reads every static form the build writes, and no dynamic one', () => {
    const dist = build({
      'assets/forms-AAAAAAAA.js':
        'import{a}from"./a.js";import"./b.js";export*from"./c.js";export{d}from\'./d.js\';' +
        'var l=()=>import("./lazy.js"),m=()=>import(`./lazy.js`),n=import.meta.resolve("./lazy.js");\n' +
        'import "./e.js";\n',
      ...Object.fromEntries(
        ['a', 'b', 'c', 'd', 'e', 'lazy'].map((name) => [`assets/${name}.js`, 'export{};']),
      ),
    })
    const found = staticImports(join(dist, 'assets/forms-AAAAAAAA.js'), dist)

    expect(found.map((file) => relative(dist, file))).toEqual(
      ['a', 'c', 'd', 'b', 'e'].map((name) => `assets/${name}.js`),
    )
  })

  // "A stray literal cannot inflate the total" holds only while both halves of the containment
  // rule do: the file exists, and it is inside the build.
  it('counts no file outside the build, and none that is not there', () => {
    const dist = build({
      '../outside-AAAAAAAA.js': 'export{};',
      'assets/stray-AAAAAAAA.js':
        'import{a}from"../../outside-AAAAAAAA.js";import{b}from"./missing-AAAAAAAA.js";' +
        'import{c}from"react";import{t}from"./sheet-BSYtLEmB.js";',
    })

    expect(staticImports(join(dist, 'assets/stray-AAAAAAAA.js'), dist)).toEqual([join(dist, SHEET)])
  })
})

describe('importClosure', () => {
  it('terminates on chunks that import each other', () => {
    const dist = build({
      [RUNTIME]: `import{t}from"./sheet-BSYtLEmB.js";${BUILD[RUNTIME]}`,
    })
    const closure = importClosure(join(dist, MAIN), dist)

    expect(closure.map((file) => relative(dist, file)).sort()).toEqual([
      MAIN,
      HELPER,
      RUNTIME,
      SHEET,
    ])
  })
})

describe('htmlGraph', () => {
  it('drops an href that does not resolve inside the build', () => {
    const dist = build({
      'index.html': shell(
        entryTag,
        '<link rel="modulepreload" crossorigin href="https://cdn.example/assets/vendor.js">',
        hint('assets/gone-AAAAAAAA.js'),
        hint(SHEET),
        '<link rel="stylesheet" href="/assets/main.css">',
      ),
    })

    expect(htmlGraph(join(dist, 'index.html'), dist)).toEqual([join(dist, MAIN), join(dist, SHEET)])
  })
})
