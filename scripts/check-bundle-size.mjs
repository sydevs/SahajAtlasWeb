#!/usr/bin/env node

/**
 * The bundle-size budget for the EAGER first-load payload.
 *
 * Run this after `pnpm build`. It measures whatever is in `dist/`, so a
 * stale build gives stale numbers:
 *
 *   pnpm build && pnpm size
 *
 * ## What this script measures, and why
 *
 * Per-chunk sizes mean nothing here. This build re-chunks freely, through
 * rolldown. Moving code between chunks can shrink any single file, while
 * the payload a visitor actually downloads stays unchanged. The only
 * number worth budgeting is the **eager graph**: everything the browser
 * must fetch and parse before the widget can render, measured gzipped.
 *
 * There are two entries and two graphs, because they differ:
 *
 *   1. **standalone** — `dist/index.html`. This graph is the entry
 *      `<script type="module">` plus every `<link rel="modulepreload">`.
 *      That preload list IS Vite's static import closure. It is exactly
 *      what the page pulls at boot.
 *   2. **embed** — `dist/embed.js`, the `<sahaj-atlas>` bundle a host
 *      installs. This graph is the entry plus its static import graph,
 *      walked here. The embed entry emits **zero** modulepreload hints,
 *      because nothing writes an HTML shell for it. A check that only
 *      read `index.html` would never see the embed's cost at all. The
 *      embed is the actual product.
 *
 * This script excludes dynamic `import()` targets. Read that exclusion
 * carefully — it hid a real regression for the length of one PR. A dynamic
 * import only becomes a second hop when the module HOLDING it is itself
 * lazy. `react-map-gl` 7 ran `const mapLib = import('mapbox-gl')` at module
 * scope. So while anything in the eager graph imported it, including one
 * re-export through the `organisms` barrel, 485 KiB gzipped was fetched at
 * the same time as the rest of the payload. This gate still reported a
 * comfortable number. When adding a heavy dependency, check what its
 * module BODY does, not only how the app imports it. Measuring the eager
 * graph alone keeps this check honest about what it claims to measure.
 *
 * ## About the numbers
 *
 * This script uses gzip at zlib's default level. That matches the
 * readiness-report measurement and Vite's own build report. A CDN may use
 * a different gzip level, or brotli instead. Treat these numbers as a
 * *regression detector*, comparable build-to-build, not as the exact
 * bytes sent over the wire.
 */

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { annotate, report } from './_ci-output.mjs'

// ---------------------------------------------------------------------------
// THE BUDGET. One constant, deliberately easy to edit.
//
// ⚠ A budget is judged against the SHIPPED payload — a graph's measured size
// plus its `SENTRY_GAP_KIB` entry. A figure quoted below is the uncredentialed
// measurement unless its line says credentialed, so a budget edit has to clear
// that figure plus the graph's own gap.
//
// A budget sits just above the payload of the day, at about 3% headroom: enough
// to absorb a dependency patch bump, tight enough that a newly-eager view still
// trips it. RATCHET IT DOWN again whenever the payload shrinks, or the budget
// quietly re-accumulates the slack it just won. `SLACK_RATIO` below enforces
// that rather than trusting this comment to be read.
//
// ⚠ `standalone` and `embed` deliberately hold more, since the #442 rows
// below. The four steps before them were all raises, and under 1% spare most
// dependency bumps collided with the gate, so the space those rows won back is
// kept as headroom; React 19 spent half of it, leaving about 7%. A newly-eager
// view no longer trips these two budgets — `src/Widget.standalone.test.ts` holds the eager
// graph's barrels and packages by name instead. ⚠ `SLACK_RATIO` still bites at
// 15%: about 27 KiB more off `standalone` and the ratchet asks for a lower
// budget.
//
// `loader` is the graph a host pays on every page view (#149). This script
// budgets it an order of magnitude tighter than the other two, on purpose. The
// whole justification for the loader is that a host embedding the widget below
// the fold pays almost nothing until someone scrolls to it. A loader that
// quietly grew to 30 KiB would still pass a lax budget, and give that benefit
// away. The `embed` graph now fetches only on reveal, so it is a deferred cost
// rather than an eager one. This script still budgets it, though, because
// "deferred" does not mean "free". It is the cost a visitor who does look at
// the widget waits for.
//
// Every step to today's three figures, newest first, as standalone/embed and as
// loader. `git log -p` on this constant holds each one in full, dated.
//
//   336  313.0/314.1  #446  React 19: `react` + `react-dom/client` alone gzip
//                           22.6 KiB larger than 18.3.1, helmet-async 3 0.7
//                           more; budget held, as above
//   336  289.8/290.9  #442  the zod enums moved to `z.enum`'s object form, so
//                          `satisfies Record<Theirs, Theirs>` could replace a
//                          hand-rolled equality type, +0.1
//   336  289.7/290.8  #442  framer-motion's `m` with the animation features
//                          alone, −13.2 KiB; budget held, as above, and `embed`
//                          back to 336 — #435 raised it for 0.4 KiB on 0.2
//                          spare, and this row leaves 44
//   336  301.3/302.4  #442  the shell stopped importing the molecules barrel,
//                          −30.9 KiB; budget held, as above
//   338  333.9/335.0  #435  embed only. The 44px tap areas, the row spacing
//                           they need and the contrast fixes are 0.4 KiB of
//                           generated CSS, on a graph main left 0.2 spare
//   336  331.9/333.0  #413  dependency batch; gzip paid for a different mix
//   334  330.1/331.2  #389  `colord/plugins/lab`, which every embed owes
//   330  326.8/328.6  #367  zod 4 (GHSA-mrhx-c7xc-m3w5), eager via every fetcher
//   318  307.8/309.6  #246  tailwindcss 3 → 4
//   310  299.3/301.3  #161  the map interface went behind a lazy seam, −83 KiB
//   395  382.1/383.6  #96   calendar, registration and share drawers lazied
//   495  479.5/480.4  #99
//
//   3.6  2.84/3.31 credentialed  `auto.js` split off as a classic-script bridge,
//                                for Wix, so the graph gained a whole chunk
//   3.2  2.5                     vite 8.3.5's `__vitePreload` is 1519 raw bytes
//                                against 8.3.4's 2444
//   3.8  2.9                     #199's dependency batch took 0.3 KiB off the
//                                graph and tripped the ratchet
//
// ⚠ Ratchet `standalone` and `embed` back below 330 if the zod schemas ever
// leave the eager graph.
//
// ⚠ #003 ratcheted a budget down while ADDING a package: Lucide's tree-shaken
// glyphs cost less than the hand-drawn path data they replaced. A swap that
// adds a dependency can still win space.
export const BUDGET_KIB = {
  standalone: 336,
  loader: 3.6,
  embed: 336,
}

// What `@sentry/vite-plugin`'s per-chunk debug-ID snippet adds to each graph,
// in KiB, for a build with no token to trigger it. It scales with chunk count
// rather than bytes, so it is per-graph: 0.5 KiB is 17% of the loader graph and
// 1.2 KiB is 0.4% of the embed graph.
//
// Measured with `@sentry/vite-plugin` 11.15.0, built both ways — `pnpm build`,
// then again under `ci.yml`'s "Source-map upload chain (offline dry run)"
// environment, which is the only credentialed build reachable without a real
// token (`docs/rules/deployment.md`). The chunk count each figure was taken at
// is what dates it, and the plugin version, which writes the snippet:
//
//   standalone  332.224 → 333.385 KiB   8 chunks
//   loader        2.840 →   3.305 KiB   3 chunks
//   embed       333.305 → 334.503 KiB   8 chunks
//
// ⚠ Measure a new graph before giving it an entry, and re-measure all three
// when a graph's chunk count moves. Deriving a figure from a neighbour, or
// leaving one at a count it was not taken at, is how it stops being a
// measurement: `standalone` read 1.1 at ca3f207 and reads 1.2 here. Every
// derived figure in the block above is the one these entries produce, so a
// re-measure moves them too.
export const SENTRY_GAP_KIB = {
  standalone: 1.2,
  loader: 0.5,
  embed: 1.2,
}

// `@sentry/vite-plugin` names the snippet it injects, so a build that already
// carries it is recognisable and the gap must not be added twice. ⚠ Match this
// identifier, never `_sentryDebugIds`: the Sentry SDK's own lookup code spells
// that one and every build emits it. It sits in a lazy chunk outside all three
// graphs today, so the looser match happens to read the same — one re-chunk
// away from declaring every build credentialed and scoring the gap at zero.
const DEBUG_ID_MARKER = '_sentryDebugIdIdentifier'

/**
 * Did a credentialed build already inject the snippet into every chunk here?
 *
 * ⚠ Every chunk, not any. The plugin injects into all of them — 26 of 26
 * emitted files under a token, 0 of 26 without one — so a `dist/` mixing the
 * two kinds of build scores as uncredentialed and is charged the gap. That is
 * the direction #413 was wrong in, and the only one this detection may fail in.
 */
export function hasDebugIds(files, read) {
  return files.length > 0 && files.every((file) => read(file).includes(DEBUG_ID_MARKER))
}

// A budget set far above the real payload is a green check that checks
// nothing. That is the exact failure this script was written against,
// just a slower version of it. So running far UNDER budget also fails
// this check. The fix is one line: bring `BUDGET_KIB` down, in the same
// commit that won the space.
//
// This is also the only guard that catches a half-broken import walker.
// The walkers are regexes over minified output. If one stops matching
// some import shape, the graph shrinks, and the total collapses. An
// over-budget check alone would then report a comfortable pass, on a
// payload it never actually measured.
//
// No floor under this ratio since #414: both rules read the shipped figure
// now, so the loader budget has the whole 3.26-to-3.83 KiB window the ratio
// allows, and a floor would only loosen the ratchet on the smallest graph.
const SLACK_RATIO = 0.15

const DIST = resolve(import.meta.dirname, '..', 'dist')
const KIB = 1024

/** The gzipped size of one built file, in bytes. */
function gzipBytes(file) {
  return gzipSync(readFileSync(file)).length
}

/**
 * The static import specifiers in a built ES module.
 *
 * Two shapes cover rolldown's output: `… from "./x.js"` (an import or a
 * re-export), and the bare side-effect `import "./x.js"`. A dynamic
 * `import("./x.js")` has a paren before the quote, so it matches neither
 * shape. That is the point. This function discards anything that resolves
 * to a file outside `dist/`. A stray string literal that happens to look
 * like a specifier cannot inflate the total.
 */
export function staticImports(file, dist = DIST) {
  const code = readFileSync(file, 'utf8')
  const here = dirname(file)
  const specifiers = [
    ...[...code.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*["']([^"']+)["']/g)].map((m) => m[1]),
  ]

  return [...new Set(specifiers)]
    .filter((s) => s.startsWith('.'))
    .map((s) => join(here, s))
    .filter((target) => inDist(target, dist))
}

/**
 * Is this a real file inside `dist/`?
 *
 * Existence alone does not prove that. `../../../etc/hosts` both resolves
 * and exists, and this script would then gzip it and name it in the
 * summary. Checking containment is what makes the claim above true: "a
 * stray literal cannot inflate the total".
 */
function inDist(file, dist) {
  return resolve(file).startsWith(dist + sep) && existsSync(file)
}

/** Walks the static import closure from an entry file. Returns absolute paths. */
export function importClosure(entry, dist = DIST) {
  const seen = new Set([entry])
  const queue = [entry]

  while (queue.length) {
    for (const next of staticImports(queue.pop(), dist)) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }

  return [...seen]
}

/**
 * What an HTML shell declares: its entry scripts, and its modulepreload hints.
 *
 * ⚠ Kept apart, because only an entry may start a walk. A hint is a chunk the entry imports,
 * so a closure walked from one is a plausible graph with the entry chunk missing.
 */
export function htmlGraph(html, dist = DIST) {
  const source = readFileSync(html, 'utf8')

  // This applies the same containment rule as the walker above. An
  // absolute or CDN href would otherwise become a bogus path, and reach
  // `gzipBytes` as a bare `ENOENT` error.
  const inside = (pattern) =>
    [...source.matchAll(pattern)]
      .map((m) => join(dist, m[1].replace(/^\//, '')))
      .filter((file) => inDist(file, dist))

  return {
    entries: inside(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
    hints: inside(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  }
}

/**
 * Scores one graph's measured size against its budget, in shipped terms.
 *
 * `kib` is what this build contains. `shipped` is what a visitor downloads,
 * and it is the only figure the verdicts read — a gate that judged `kib`
 * reports spare space on a payload that is over budget, which is what
 * happened on #413: 333.0 KiB measured against the 334 budget of the day,
 * 334.2 shipped.
 *
 * `credentialed` says this build already emitted the debug-ID snippet, so its
 * measured size IS its shipped size. Adding the gap anyway would red a loader
 * graph sitting 0.34 KiB inside its budget.
 */
export function score(name, kib, credentialed = false) {
  const budget = BUDGET_KIB[name]
  const gap = SENTRY_GAP_KIB[name]

  // Without these checks, an unentered graph makes `spare` equal `NaN`.
  // `NaN` fails every comparison below, so a new entry would report
  // `undefined KiB` and pass the check.
  if (budget === undefined) {
    throw new Error(`No BUDGET_KIB entry for the "${name}" graph.`)
  }

  if (gap === undefined) {
    throw new Error(
      `No SENTRY_GAP_KIB entry for the "${name}" graph. Build it twice — once plain, ` +
        "once under ci.yml's offline source-map dry run — and enter the difference in " +
        'scripts/check-bundle-size.mjs.',
    )
  }

  const shipped = credentialed ? kib : kib + gap
  const spare = budget - shipped

  return {
    name,
    kib,
    shipped,
    budget,
    spare,
    credentialed,
    over: spare < 0,
    under: spare > budget * SLACK_RATIO,
  }
}

/** Measures one named graph: per-file gzip sizes, sorted heaviest first. */
function measure(name, files) {
  const parts = files
    .map((file) => ({ file: relative(DIST, file), bytes: gzipBytes(file) }))
    .sort((a, b) => b.bytes - a.bytes)

  const kib = parts.reduce((sum, p) => sum + p.bytes, 0) / KIB

  return {
    parts,
    ...score(
      name,
      kib,
      hasDebugIds(files, (f) => readFileSync(f, 'utf8')),
    ),
  }
}

/**
 * The graphs `main` scores, as absolute paths — or `failure`, the first reason the build in
 * `dist` cannot be measured.
 *
 * A function of the directory so `check-bundle-size.test.ts` can hand it a build shaped to trip
 * each refusal. The walkers are regexes over a bundler's output, and nothing else says they
 * still match it.
 *
 * @param {string} [dist]
 * @returns {{ failure: string } | { declared: string[], loaded: string[], embedGraph: string[],
 *   loaderGraph: string[] }}
 */
export function eagerGraphs(dist = DIST) {
  const indexHtml = join(dist, 'index.html')
  const embedJs = join(dist, 'embed.js')
  const autoJs = join(dist, 'auto.js')
  const loaderJs = join(dist, 'loader.js')

  // This names the missing paths. If the build succeeded and one of these
  // files was renamed instead — `entryFileNames` sets the embed filename
  // in vite.config.ts — the error message points at the rename. It does
  // not send someone to rebuild a build they just ran.
  const missing = [indexHtml, embedJs, autoJs, loaderJs].filter((f) => !existsSync(f))

  if (missing.length) {
    return {
      failure:
        `Bundle-size check found no build output at ${missing.map((f) => relative(dist, f)).join(', ')} ` +
        '— run `pnpm build` first, or update the entry names in scripts/check-bundle-size.mjs ' +
        'if vite.config.ts renamed them.',
    }
  }

  // The shell's own preload list is what the readiness report measured.
  // The closure walked from the entry is what the browser actually pulls.
  // The two agree today. This script scores their UNION, so a dropped
  // preload hint can never make the payload look smaller than it really
  // is. It can only show up as the warning in the report.
  const shell = htmlGraph(indexHtml, dist)
  const declared = [...shell.entries, ...shell.hints]

  if (!shell.entries.length) {
    return {
      failure:
        'Found no entry script in dist/index.html — the shell markup has changed, so ' +
        'the standalone payload cannot be measured. Fix htmlGraph() in ' +
        'scripts/check-bundle-size.mjs.',
    }
  }

  const loaded = importClosure(shell.entries[0], dist)
  const embedGraph = importClosure(embedJs, dist)
  // A host pays for both halves of the loader on every page view: `auto.js`, the classic-script
  // bridge that imports nothing (`pnpm assert:classic` holds that), and the module it inserts.
  const loaderGraph = [autoJs, ...importClosure(loaderJs, dist)]

  // The whole loader split rests on this seam: `loader.js` must reach
  // `embed.js` only through a DYNAMIC import, never a static one.
  // Rolldown would happily hoist `embed.js` into the loader's graph if
  // someone replaced the `import(…)` call with a top-level import. The
  // result would look fine — the widget would still work. But every host
  // would silently go back to paying the full payload on every page view.
  // The budget check above would catch this, but only as a number. This
  // check names the actual mistake.
  if (loaderGraph.some((file) => basename(file) === 'embed.js')) {
    return {
      failure:
        "loader.js statically imports embed.js — the widget is back in the loader's eager graph, " +
        'so every host pays the full payload up front again. The import in src/loader/index.ts ' +
        'must stay a dynamic `import()`.',
    }
  }

  // This checks the same seam, one size down — the half of the problem
  // that actually got through (#153). A single VALUE import from `src/`
  // into the loader, or out of it, makes that module reachable from both
  // entries. Rolldown then factors it into a chunk that BOTH `loader.js`
  // and `embed.js` import statically. The check above cannot see this,
  // because the shared chunk is not named `embed.js`. The size budget
  // cannot see it either, because a shared helper costs only a couple
  // hundred bytes. What the host actually pays is not the bytes. It is an
  // extra request on the loader's critical path, on every page view,
  // forever.
  //
  // `src/loader/literals.ts` exists to prevent this exact mechanism.
  // Until now, its only enforcement was that file's own docblock. The fix
  // is to never import across the seam. Duplicate the value into
  // `literals.ts` instead, and pin both copies in
  // `src/loader/literals.test.ts`.
  //
  // Rolldown's own runtime helpers are exempt from this check. The
  // bundler itself emits them into every entry, and this repo does not
  // own them to deduplicate. If rolldown ever renames these helpers, this
  // check will fire on them. That reads as a false positive, but it is a
  // real signal: the exemption below needs the new names.
  const BUNDLER_HELPER = /^(preload-helper|rolldown-runtime)-/
  const shared = loaderGraph.filter(
    (file) => embedGraph.includes(file) && !BUNDLER_HELPER.test(basename(file)),
  )

  if (shared.length) {
    return {
      failure:
        `loader.js and embed.js share ${shared.length} chunk(s) — ${shared.map((f) => basename(f)).join(', ')}. ` +
        'A value import across the loader/widget seam puts a chunk in both graphs, so every host ' +
        'fetches it up front whether or not the widget ever renders. Duplicate the value into ' +
        'src/loader/literals.ts and pin it in literals.test.ts instead — or, if rolldown has ' +
        'renamed its runtime helpers, add the new name to BUNDLER_HELPER here.',
    }
  }

  // The walkers are regexes over minified output. Their silent failure
  // mode is finding NOTHING, and scoring a payload of just one small
  // entry file. That produces an under-budget pass that means the
  // opposite of what it says. A real graph has several chunks. One file
  // means rolldown's output shape has moved.
  for (const [entry, graph] of [
    ['index.html', loaded],
    ['embed.js', embedGraph],
  ]) {
    if (graph.length < 2) {
      return {
        failure:
          `Import walker found no chunks for ${entry} — the build's output shape has ` +
          'probably changed, and these sizes cannot be trusted. Fix staticImports() ' +
          'in scripts/check-bundle-size.mjs.',
      }
    }
  }

  return { declared, loaded, embedGraph, loaderGraph }
}

function main() {
  const eager = eagerGraphs()

  if ('failure' in eager) {
    annotate('error', eager.failure)
    process.exit(1)
  }

  const { declared, loaded, embedGraph, loaderGraph } = eager
  const graphs = [
    measure('standalone', [...new Set([...declared, ...loaded])]),
    measure('loader', loaderGraph),
    measure('embed', embedGraph),
  ]

  const lines = [
    '### Bundle size — eager payload (gzipped)',
    '',
    '| Graph | Measured | Shipped | Budget | |',
    '| --- | ---: | ---: | ---: | :-- |',
  ]

  for (const g of graphs) {
    const verdict = g.over
      ? `❌ over by ${(-g.spare).toFixed(1)} KiB`
      : `✅ ${g.spare.toFixed(1)} KiB spare`

    lines.push(
      `| \`${g.name}\` | ${g.kib.toFixed(1)} KiB | ${g.shipped.toFixed(1)} KiB | ${g.budget} KiB | ${verdict} |`,
    )
  }

  // Otherwise the two columns agreeing reads as a bug in the gate. Named per
  // graph rather than per build, so a `dist/` holding chunks from both kinds of
  // build says so instead of looking uniform.
  const asShipped = graphs.filter((g) => g.credentialed)

  if (asShipped.length) {
    lines.push(
      '',
      `> ${asShipped.map((g) => `\`${g.name}\``).join(', ')} already ` +
        `${asShipped.length === 1 ? 'carries' : 'carry'} the Sentry debug-ID snippet, so ` +
        'the measurement IS the shipped payload and no gap was added.',
    )
  }

  lines.push('', '<details><summary>Chunks in each graph</summary>', '')

  for (const g of graphs) {
    lines.push(`**${g.name}**`, '')
    for (const p of g.parts) {
      lines.push(`- \`${p.file}\` — ${(p.bytes / KIB).toFixed(1)} KiB`)
    }
    lines.push('')
  }

  lines.push('</details>')

  const hinted = new Set(declared)
  const undeclared = loaded.filter((f) => !hinted.has(f)).map((f) => relative(DIST, f))

  if (undeclared.length) {
    lines.push(
      '',
      `> ⚠️ Loaded by \`index.html\` but not preloaded: ${undeclared.map((f) => `\`${f}\``).join(', ')}.` +
        ' Counted in the total above, but a visitor discovers them a round trip late.',
    )
  }

  const over = graphs.filter((g) => g.over)
  const under = graphs.filter((g) => g.under)
  // Each graph carries its own budget: two graphs can fail against different ones.
  const name = (list) =>
    list.map((g) => `${g.name} ships ${g.shipped.toFixed(1)} of ${g.budget} KiB`).join('; ')

  if (under.length) {
    lines.push(
      '',
      `> 📉 ${under.map((g) => `\`${g.name}\``).join(' and ')} now ` +
        `${under.length === 1 ? 'ships' : 'ship'} further under budget than ` +
        `${SLACK_RATIO * 100}%. Lower \`BUDGET_KIB\` to lock the win in.`,
    )
  }

  report(lines)

  if (over.length) {
    annotate(
      'error',
      `Bundle size over budget: ${name(over)}. Either reduce the eager payload, or — if ` +
        'the growth is intended and justified — raise BUDGET_KIB in ' +
        'scripts/check-bundle-size.mjs in the same commit, with the reason in the commit ' +
        'message.',
    )
    process.exit(1)
  }

  // This fails the check, rather than only warning. A notice here would
  // leave the budget describing a payload that no longer exists. That is
  // the same silent-green failure this whole script is aimed at. It is
  // also what a half-broken import walker looks like, where a passing
  // check would be actively false.
  if (under.length) {
    annotate(
      'error',
      `Bundle size is far UNDER budget: ${name(under)}. ` +
        'If the payload really shrank, lower BUDGET_KIB in scripts/check-bundle-size.mjs ' +
        'to match — a budget this loose stops detecting anything. If it did not, the ' +
        'import walker has stopped seeing part of the graph and these numbers are wrong.',
    )
    process.exit(1)
  }
}

// Lets the spec import `score` without running the check. `realpathSync` on both sides, as
// `assert-preview-host.mjs` does, because `process.argv[1]` keeps a symlink's path while
// `import.meta.url` resolves to the target — and a guard that reads false here exits 0 having
// measured nothing, which is the silent green this whole script refuses. ⚠ It is tested first:
// `realpathSync('')` throws ENOENT, so a defaulted empty would crash the import.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  main()
}
