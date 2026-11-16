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
 * lazy. `react-map-gl` runs `const mapLib = import('mapbox-gl')` at module
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

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { annotate, report } from './_ci-output.mjs'

// ---------------------------------------------------------------------------
// THE BUDGET. One constant, deliberately easy to edit.
//
// ⚠ A budget is judged against the SHIPPED payload — a graph's measured
// size plus its `SENTRY_GAP_KIB` entry. A figure quoted below is the
// uncredentialed measurement unless its line says credentialed, so a budget
// edit has to clear that figure plus the graph's own gap.
//
// This value sits just above the payload as measured on 2026-08-20. It
// catches unnoticed *growth* without failing on the day this comment was
// written. The headroom is about 3%. That is enough to absorb a
// dependency patch bump, and tight enough that a newly-eager view still
// trips it.
//
//   standalone  307.8 KiB  →  318
//   embed       309.6 KiB  →  318
//
// The tailwindcss 3 → 4 upgrade (#246) raised this budget from 308, the
// first raise since #161. Measured against origin/main at 5c85fda, built
// the same uncredentialed way:
//
//   standalone  301.9 → 307.8 KiB
//   embed       303.7 → 309.6 KiB
//   loader        2.7 →   2.7 KiB
//
// The Lucide icon swap (#003) ratcheted this budget down. It took about
// 3 KiB off both graphs. The tree-shaken glyphs cost less than the
// hand-drawn path data they replaced, even after adding a dependency.
// Note the direction: a swap that ADDS a package can still win space. The
// ratchet stops that win from being quietly spent again later.
//
// The previous budget was 310/310, against a measured 299.3/301.3 (issue
// #161). That issue took about 83 KiB off both graphs, by moving the
// whole map-bearing interface behind a lazy `FullInterface` seam. This is
// what makes a compact embed cheap: a slot too small for the interface
// mounts a card and one dialog, and it never fetches mapbox-gl at all.
// Before that, the budget was 395/395, against 382.1/383.6 (issue #96,
// which lazied the calendar, registration, and share drawers, saving
// 99.7 KiB). Before that, the budget was 495/495, against 479.5/480.4
// (issue #99).
//
// RATCHET THIS DOWN again whenever the payload shrinks. Otherwise the
// budget quietly re-accumulates the slack it just won. `SLACK_RATIO`
// below enforces this rule, rather than trusting this comment to be read.
// ---------------------------------------------------------------------------
// `loader` is the graph a host pays on every page view (#149). This
// script budgets it an order of magnitude tighter than the other two, on
// purpose. The whole justification for the loader is that a host
// embedding the widget below the fold pays almost nothing until someone
// scrolls to it. A loader that quietly grew to 30 KiB would still pass a
// lax budget, and give that benefit away. The `embed` graph now fetches
// only on reveal, so it is a deferred cost rather than an eager one. This
// script still budgets it, though, because "deferred" does not mean
// "free". It is the cost a visitor who does look at the widget waits for.
//
// The loader budget was 3.8 against a measured 2.9 (#199's routine
// dependency batch took 0.3 KiB off the graph, which tripped the ratchet
// below). It is 3.2 now, because vite 8.3.5 emits a smaller
// `__vitePreload` helper than 8.3.4 — 1519 bytes against 2444, raw.
//
//   loader   2.5 KiB  uncredentialed  ← the number CI measures
//   loader   2.8 KiB  credentialed    ← what production ships, derived
//
// 3.2 clears the 2.8 production ships and stays inside the slack window.
//
// 3.6 since the loader split in two: `auto.js` became a classic-script
// bridge to `loader.js`, because Wix loads it with no `type`. The bridge is
// its own chunk, so it adds its bytes and one more debug-ID snippet:
//
//   loader   2.78 KiB  uncredentialed  ← the number CI measures
//   loader   3.26 KiB  credentialed    ← what the gate scores, 0.34 spare
// `standalone` and `embed` were 318 until zod 4 (GHSA-mrhx-c7xc-m3w5). zod 4's
// classic API is bigger than 3.25.76's in this graph, and the schemas are eager
// because every fetcher parses through one. Measured uncredentialed, which is
// what CI reads:
//
//   standalone  326.8 KiB
//   embed       328.6 KiB
//
// Production ships each plus this graph's Sentry gap above — 327.9 and 329.8,
// derived rather than built, since no credentialed build ran here.
//
// ⚠ `embed` shipped 0.2 KiB inside the 330 this budget was then, and the gate
// could not see it: it read 328.6 and reported 1.4 KiB spare. The pair was
// 324.4/326.2 when 330 was set, so the margin went unmeasured until #367, and
// #414 is what put the gap inside the comparison. Ratchet the budget back if
// the schemas ever leave the eager graph.
//
// 334 since #389. `colord/plugins/lab` is the eager cost: `selected-distinct`
// compares the selected pin against the ordinary one, which is a colour-versus-
// colour measure the a11y plugin cannot make, and every embed owes that check.
// Measured uncredentialed, which is what CI reads:
//
//   standalone  330.1 KiB
//   embed       331.2 KiB
//
// Production ships each plus this graph's Sentry gap below — 331.2 and 332.4 —
// which is what the gate scores. So the budget clears the shipped pair by about
// 1.6 KiB, and sits far inside the 15% slack the ratchet below reads.
//
// 336 since #413's routine dependency batch, which took `embed` to 333.0
// uncredentialed. Production then shipped 334.2 — past 334, while the gate read
// 1.0 KiB spare. That is the #367 blind spot above, biting, and #414 is what put
// the gap inside the comparison so it cannot bite again. Measured
// uncredentialed, which is what CI reads:
//
//   standalone  331.9 KiB
//   embed       333.0 KiB
//
// Production ships each plus this graph's Sentry gap below — 333.0 and 334.2.
// 336 clears the shipped pair by 1.8 KiB, the margin #389 left.
//
// Nothing in that batch could be held back to win the 1.6 KiB. Reverted one at
// a time against the rest, the largest single contributor was `react-hook-form`
// at 0.4 KiB, and `vite` 8.3.5 and 8.3.8 emit a byte-identical `sheet` chunk
// (520,264 B raw either way) that gzips 1.5 KiB larger than main's 521,993 B.
// Gzip is paying for a different mix, not the minifier.
export const BUDGET_KIB = {
  standalone: 336,
  loader: 3.6,
  embed: 336,
}

// What a credentialed build adds to each graph, in KiB. `@sentry/vite-plugin`
// injects a debug-ID snippet into every chunk, and no local build, CI run or
// fork build holds the token that triggers it. So the files this script
// measures are not the files a visitor downloads, and the difference is what
// the budget above is actually about.
//
// The gap scales with chunk count, not bytes, so it is per-graph: 0.5 KiB is
// 17% of the loader graph and 1.2 KiB is 0.4% of the embed graph. A flat
// figure is wrong in both directions.
//
// Measured on ca3f207, one commit built both ways — `pnpm build`, and again
// under `ci.yml`'s "Source-map upload chain (offline dry run)" environment,
// which is the only credentialed build reachable without a real token
// (`docs/rules/deployment.md`):
//
//   standalone  330.341 → 331.465 KiB
//   loader        2.759 →   3.224 KiB
//   embed       331.422 → 332.574 KiB
//
// ⚠ A new graph needs its own measurement before it gets an entry here.
// Deriving one from a neighbour is how the figure stops being a measurement.
export const SENTRY_GAP_KIB = {
  standalone: 1.1,
  loader: 0.5,
  embed: 1.2,
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
// A `SLACK_FLOOR_KIB = 1` sat beside this ratio until #414. It existed
// because the two rules read different numbers — a budget had to clear the
// credentialed payload while the ratchet measured slack against the
// uncredentialed one, leaving the loader a window about 0.03 KiB wide. Both
// read the shipped figure now, so that window is the 3.28-to-3.86 KiB the
// ratio allows, and a floor would only loosen the ratchet.
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
function staticImports(file) {
  const code = readFileSync(file, 'utf8')
  const here = dirname(file)
  const specifiers = [
    ...[...code.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bimport\s*["']([^"']+)["']/g)].map((m) => m[1]),
  ]

  return [...new Set(specifiers)]
    .filter((s) => s.startsWith('.'))
    .map((s) => join(here, s))
    .filter(inDist)
}

/**
 * Is this a real file inside `dist/`?
 *
 * Existence alone does not prove that. `../../../etc/hosts` both resolves
 * and exists, and this script would then gzip it and name it in the
 * summary. Checking containment is what makes the claim above true: "a
 * stray literal cannot inflate the total".
 */
function inDist(file) {
  return resolve(file).startsWith(DIST + sep) && existsSync(file)
}

/** Walks the static import closure from an entry file. Returns absolute paths. */
function importClosure(entry) {
  const seen = new Set([entry])
  const queue = [entry]

  while (queue.length) {
    for (const next of staticImports(queue.pop())) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }

  return [...seen]
}

/** The entry script plus every modulepreload hint declared by an HTML shell. */
function htmlGraph(html) {
  const source = readFileSync(html, 'utf8')
  const hrefs = [
    ...[...source.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
  ]

  // This applies the same containment rule as the walker above. An
  // absolute or CDN href would otherwise become a bogus path, and reach
  // `gzipBytes` as a bare `ENOENT` error.
  return hrefs.map((href) => join(DIST, href.replace(/^\//, ''))).filter(inDist)
}

/**
 * Scores one graph's measured size against its budget, in shipped terms.
 *
 * `kib` is what this build contains. `shipped` is what a visitor downloads,
 * and it is the only figure the verdicts read — a gate that judged `kib`
 * would report spare space on a payload that is over budget, which is what
 * it did on #413.
 */
export function score(name, kib) {
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

  const shipped = kib + gap
  const spare = budget - shipped

  return {
    name,
    kib,
    gap,
    shipped,
    budget,
    spare,
    over: spare < 0,
    under: spare > budget * SLACK_RATIO,
  }
}

/** Measures one named graph: per-file gzip sizes, sorted heaviest first. */
function measure(name, files) {
  const parts = files
    .map((file) => ({ file: relative(DIST, file), bytes: gzipBytes(file) }))
    .sort((a, b) => b.bytes - a.bytes)

  return { parts, ...score(name, parts.reduce((sum, p) => sum + p.bytes, 0) / KIB) }
}

function main() {
  const indexHtml = join(DIST, 'index.html')
  const embedJs = join(DIST, 'embed.js')
  const autoJs = join(DIST, 'auto.js')
  const loaderJs = join(DIST, 'loader.js')

  // This names the missing paths. If the build succeeded and one of these
  // files was renamed instead — `entryFileNames` sets the embed filename
  // in vite.config.ts — the error message points at the rename. It does
  // not send someone to rebuild a build they just ran.
  const missing = [indexHtml, embedJs, autoJs, loaderJs].filter((f) => !existsSync(f))

  if (missing.length) {
    annotate(
      'error',
      `Bundle-size check found no build output at ${missing.map((f) => relative(DIST, f)).join(', ')} ` +
        '— run `pnpm build` first, or update the entry names in scripts/check-bundle-size.mjs ' +
        'if vite.config.ts renamed them.',
    )
    process.exit(1)
  }

  // The shell's own preload list is what the readiness report measured.
  // The closure walked from the entry is what the browser actually pulls.
  // The two agree today. This script scores their UNION, so a dropped
  // preload hint can never make the payload look smaller than it really
  // is. It can only show up as the warning below.
  const declared = htmlGraph(indexHtml)

  if (!declared.length) {
    annotate(
      'error',
      'Found no entry script in dist/index.html — the shell markup has changed, so ' +
        'the standalone payload cannot be measured. Fix htmlGraph() in ' +
        'scripts/check-bundle-size.mjs.',
    )
    process.exit(1)
  }

  const loaded = importClosure(declared[0])
  const embedGraph = importClosure(embedJs)
  // A host pays for both halves of the loader on every page view: `auto.js`, the classic-script
  // bridge that imports nothing (`pnpm assert:classic` holds that), and the module it inserts.
  const loaderGraph = [autoJs, ...importClosure(loaderJs)]

  // The whole loader split rests on this seam: `loader.js` must reach
  // `embed.js` only through a DYNAMIC import, never a static one.
  // Rolldown would happily hoist `embed.js` into the loader's graph if
  // someone replaced the `import(…)` call with a top-level import. The
  // result would look fine — the widget would still work. But every host
  // would silently go back to paying the full payload on every page view.
  // The budget check above would catch this, but only as a number. This
  // check names the actual mistake.
  if (loaderGraph.some((file) => basename(file) === 'embed.js')) {
    annotate(
      'error',
      "loader.js statically imports embed.js — the widget is back in the loader's eager graph, " +
        'so every host pays the full payload up front again. The import in src/loader/index.ts ' +
        'must stay a dynamic `import()`.',
    )
    process.exit(1)
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
    annotate(
      'error',
      `loader.js and embed.js share ${shared.length} chunk(s) — ${shared.map((f) => basename(f)).join(', ')}. ` +
        'A value import across the loader/widget seam puts a chunk in both graphs, so every host ' +
        'fetches it up front whether or not the widget ever renders. Duplicate the value into ' +
        'src/loader/literals.ts and pin it in literals.test.ts instead — or, if rolldown has ' +
        'renamed its runtime helpers, add the new name to BUNDLER_HELPER here.',
    )
    process.exit(1)
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
      annotate(
        'error',
        `Import walker found no chunks for ${entry} — the build's output shape has ` +
          'probably changed, and these sizes cannot be trusted. Fix staticImports() ' +
          'in scripts/check-bundle-size.mjs.',
      )
      process.exit(1)
    }
  }

  const graphs = [
    measure('standalone', [...new Set([...declared, ...loaded])]),
    measure('loader', loaderGraph),
    measure('embed', embedGraph),
  ]

  // Both figures, because a reader who sees only one cannot tell which rule
  // a budget edit has to clear. `measured` is these files; `shipped` is
  // those files plus the Sentry debug-ID snippet no build here emits.
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
  const name = (list) => list.map((g) => `${g.name} ${g.shipped.toFixed(1)} KiB`).join('; ')

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
      `Bundle size over budget: ${name(over)} shipped (budget ${over[0].budget} KiB). ` +
        'That is the measured graph plus its SENTRY_GAP_KIB entry, so a measured figure ' +
        'inside the budget still fails here. Either reduce the eager payload, or — if the ' +
        'growth is intended and justified — raise BUDGET_KIB in ' +
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
      `Bundle size is far UNDER budget: ${name(under)} shipped against ${under[0].budget} KiB. ` +
        'If the payload really shrank, lower BUDGET_KIB in scripts/check-bundle-size.mjs ' +
        'to match — a budget this loose stops detecting anything. If it did not, the ' +
        'import walker has stopped seeing part of the graph and these numbers are wrong.',
    )
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
