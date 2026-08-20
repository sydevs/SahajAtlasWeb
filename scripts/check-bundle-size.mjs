#!/usr/bin/env node

/**
 * Bundle-size budget for the EAGER first-load payload.
 *
 * Run after `pnpm build` (it measures whatever is in `dist/`, so a stale build
 * gives stale numbers):
 *
 *   pnpm build && pnpm size
 *
 * ## What it measures, and why it measures it this way
 *
 * Per-chunk sizes are meaningless here: this build re-chunks freely (rolldown),
 * so moving code between chunks makes any single file shrink while the payload
 * a visitor actually downloads is unchanged. The only number worth budgeting is
 * the **eager graph** — everything the browser must fetch and parse before the
 * widget can render — gzipped.
 *
 * Two entries, two graphs, because they differ:
 *
 *   1. **standalone** — `dist/index.html`: the entry `<script type="module">`
 *      plus every `<link rel="modulepreload">`. That preload list IS Vite's
 *      static import closure, so it is exactly what the page pulls at boot.
 *   2. **embed** — `dist/embed.js` (the `<sahaj-atlas>` bundle a host installs):
 *      the entry plus its static import graph, walked here. The embed entry
 *      emits **zero** modulepreload hints (nothing writes an HTML shell for it),
 *      so a check that only read `index.html` would never see the embed's cost
 *      at all — and the embed is the actual product.
 *
 * Dynamic `import()` targets are excluded — but read that carefully, because it hid a real
 * regression for the length of one PR. A dynamic import is only a second hop when the module
 * HOLDING it is itself lazy. `react-map-gl` runs `const mapLib = import('mapbox-gl')` at module
 * scope, so while anything in the eager graph imported it — including one re-export through the
 * `organisms` barrel — 485 KiB gz was fetched concurrently with the payload and this gate
 * reported a comfortable number. If you are adding a heavy dependency, check what its module
 * BODY does, not just how the app imports it.
 * eager graph alone keeps this check honest about what it claims to measure.
 *
 * ## About the numbers
 *
 * gzip at zlib's default level, matching the readiness-report measurement and
 * Vite's own build report. A CDN may use a different level or brotli entirely,
 * so treat these as a *regression detector* (comparable build-to-build), not as
 * bytes-on-the-wire.
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

import { annotate, report } from './_ci-output.mjs'

// ---------------------------------------------------------------------------
// THE BUDGET. One constant, deliberately easy to edit.
//
// Set just above the payload as measured on 2026-08-20, so this catches
// unnoticed *growth* without failing the day it lands. Headroom is ~3%: enough
// to absorb a dependency patch bump, tight enough that a newly-eager view trips
// it — and comfortably above the ~2.1 KiB a credentialed build adds that CI
// cannot see (see SLACK_FLOOR_KIB below).
//
//   standalone  299.3 KiB  →  310
//   embed       301.3 KiB  →  310
//
// Ratcheted here by issue #161, which took ~83 KiB off both graphs by moving the
// whole map-bearing interface behind a lazy `FullInterface` seam. That is what
// makes a compact embed cheap: a slot too small for the interface now mounts a
// card and one dialog, and never fetches mapbox-gl at all.
//
// The previous line was 395/395 against 382.1/383.6 (issue #96, which took 99.7
// KiB off by lazying the calendar, registration and share drawers); before that
// 495/495 against 479.5/480.4 (issue #99).
//
// RATCHET THIS DOWN again whenever the payload shrinks, or the budget quietly
// re-accumulates the slack it just won. `SLACK_RATIO` below enforces that rather
// than trusting this comment to be read.
// ---------------------------------------------------------------------------
// `loader` is the one a host actually pays on every page view (#149). It is budgeted an order of
// magnitude tighter than the other two on purpose: its entire justification is that a host who
// embeds the widget below the fold pays almost nothing until somebody scrolls to it, and a loader
// that quietly grew to 30 KiB would still pass a lax budget while having given that away. The
// `embed` graph is now fetched only on reveal, so it is a deferred cost rather than an eager one
// — but it is still budgeted, because "deferred" is not "free" and it is what a visitor who does
// look at the widget waits for.
const BUDGET_KIB = {
  standalone: 310,
  loader: 3.8,
  embed: 310,
}

// A budget far above the real payload is a green check that checks nothing —
// the exact failure this script was written against, just slower. So running
// this far UNDER budget fails too, and the fix is one line: bring BUDGET_KIB
// down in the commit that won the space.
//
// It is also the only guard that catches the walkers half-breaking. They are
// regexes over minified output; if one stops matching some import shape, the
// graph shrinks, the total collapses, and an over-budget check alone would
// report a comfortable pass on a payload it never measured.
const SLACK_RATIO = 0.15

// A FLOOR under the slack allowance, in KiB, without which the ratchet rule and the
// leave-headroom-for-Sentry rule are mathematically unsatisfiable on a small graph.
//
// CLAUDE.md records that a credentialed build ships more than CI measures, because
// `@sentry/vite-plugin` injects a debug-ID snippet per chunk and CI has no token. Measured
// on this build: +2.1 KiB on `standalone` and `embed`, and **+0.5 KiB on `loader`**. The
// absolute cost is small; the RATIO is not, because it scales with chunk count rather than
// bytes — 0.5 KiB is 17% of the 3.0 KiB loader graph, where it is 0.6% of the embed's.
//
// So for a graph this small the two rules collide head-on. A budget high enough to clear the
// credentialed build (> 3.5) leaves spare that a flat 15% then calls "far under budget", and
// the only numbers satisfying both sit in a window ~0.03 KiB wide. That is not a budget, it
// is a knife edge, and the next person to touch the loader would have hit it.
//
// The floor resolves it without weakening anything: on the big graphs 15% is far larger and
// still governs, so their ratchet behaviour is unchanged. It only ever applies where the
// percentage would be tighter than the known, unavoidable delta between what CI can measure
// and what production ships.
const SLACK_FLOOR_KIB = 1

const DIST = resolve(import.meta.dirname, '..', 'dist')
const KIB = 1024

/** Gzipped size of one built file, in bytes. */
function gzipBytes(file) {
  return gzipSync(readFileSync(file)).length
}

/**
 * Static import specifiers in a built ES module.
 *
 * Two shapes cover rolldown's output: `… from "./x.js"` (import and re-export)
 * and the bare side-effect `import "./x.js"`. Dynamic `import("./x.js")` has a
 * paren before the quote and so matches neither — which is the point. Anything
 * that resolves to a file not in `dist/` is discarded, so a stray string
 * literal that happens to look like a specifier can't inflate the total.
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
 * Existence alone isn't the claim the docblock above makes: `../../../etc/hosts`
 * both resolves and exists, and would then be gzipped and named in the summary.
 * Containment is what makes "a stray literal can't inflate the total" true.
 */
function inDist(file) {
  return resolve(file).startsWith(DIST + sep) && existsSync(file)
}

/** Walk the static import closure from an entry file. Returns absolute paths. */
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

/** The entry script + every modulepreload hint declared by an HTML shell. */
function htmlGraph(html) {
  const source = readFileSync(html, 'utf8')
  const hrefs = [
    ...[...source.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]),
    ...[...source.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
  ]

  // Same containment rule as the walker: an absolute or CDN href would
  // otherwise become a bogus path and reach gzipBytes as a bare ENOENT.
  return hrefs.map((href) => join(DIST, href.replace(/^\//, ''))).filter(inDist)
}

/** Measure one named graph: per-file gzip sizes, sorted heaviest first. */
function measure(name, files) {
  const parts = files
    .map((file) => ({ file: relative(DIST, file), bytes: gzipBytes(file) }))
    .sort((a, b) => b.bytes - a.bytes)

  const kib = parts.reduce((sum, p) => sum + p.bytes, 0) / KIB
  const budget = BUDGET_KIB[name]

  // Without this, an unbudgeted graph makes `spare` NaN, and NaN fails every
  // comparison below — so a new entry would report `undefined KiB` and pass.
  if (budget === undefined) {
    throw new Error(`No BUDGET_KIB entry for the "${name}" graph.`)
  }

  return { name, parts, kib, budget, spare: budget - kib }
}

function main() {
  const indexHtml = join(DIST, 'index.html')
  const embedJs = join(DIST, 'embed.js')
  const autoJs = join(DIST, 'auto.js')

  // Name the paths: if the build is fine and one of these was renamed (the embed
  // filename is `entryFileNames` in vite.config.ts), the message has to point at
  // the rename rather than send someone to rebuild a build they just ran.
  const missing = [indexHtml, embedJs].filter((f) => !existsSync(f))

  if (missing.length) {
    annotate(
      'error',
      `Bundle-size check found no build output at ${missing.map((f) => relative(DIST, f)).join(', ')} ` +
        '— run `pnpm build` first, or update the entry names in scripts/check-bundle-size.mjs ' +
        'if vite.config.ts renamed them.',
    )
    process.exit(1)
  }

  // The shell's own list is what the readiness report measured, but the closure
  // walked from the entry is what the browser actually pulls. They agree today;
  // scoring their UNION means a dropped preload hint can never make the payload
  // look smaller than it is — it can only show up as the warning below.
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
  const loaderGraph = importClosure(autoJs)

  // The seam the whole loader split rests on: `embed.js` must be reachable from `auto.js` only
  // through a DYNAMIC import, never a static one. Rolldown would happily hoist it into the
  // loader's graph if someone replaced the `import(…)` with a top-level import, and the result
  // would look fine — the widget would still work — while every host silently went back to
  // paying the full payload on every page view. The budget above would catch it, but only as a
  // number; this names the mistake.
  if (loaderGraph.some((file) => basename(file) === 'embed.js')) {
    annotate(
      'error',
      "auto.js statically imports embed.js — the widget is back in the loader's eager graph, " +
        'so every host pays the full payload up front again. The import in src/loader/index.ts ' +
        'must stay a dynamic `import()`.',
    )
    process.exit(1)
  }

  // The same seam, one size down — and the half that actually got through (#153). A single VALUE
  // import from `src/` into the loader (or out of it) makes that module reachable from both
  // entries, so rolldown factors it into a chunk BOTH `auto.js` and `embed.js` statically import.
  // The check above cannot see it, because the chunk is not `embed.js`, and the budget cannot
  // either, because a shared helper is a couple of hundred bytes. What the host pays is not the
  // bytes but an extra request on the loader's critical path, on every page view, forever.
  //
  // This is the mechanism `src/loader/literals.ts` exists to prevent, and until now its whole
  // enforcement was that docblock. The fix is never to import across the seam: duplicate the value
  // into `literals.ts` and pin the copies in `src/loader/literals.test.ts`.
  //
  // Rolldown's own runtime helpers are exempt — they are emitted into every entry by the bundler
  // itself and are not ours to deduplicate. If rolldown renames them this will fire on them, which
  // reads as a false positive but is a real signal that the exemption needs its new names.
  const BUNDLER_HELPER = /^(preload-helper|rolldown-runtime)-/
  const shared = loaderGraph.filter(
    (file) => embedGraph.includes(file) && !BUNDLER_HELPER.test(basename(file)),
  )

  if (shared.length) {
    annotate(
      'error',
      `auto.js and embed.js share ${shared.length} chunk(s) — ${shared.map((f) => basename(f)).join(', ')}. ` +
        'A value import across the loader/widget seam puts a chunk in both graphs, so every host ' +
        'fetches it up front whether or not the widget ever renders. Duplicate the value into ' +
        'src/loader/literals.ts and pin it in literals.test.ts instead — or, if rolldown has ' +
        'renamed its runtime helpers, add the new name to BUNDLER_HELPER here.',
    )
    process.exit(1)
  }

  // The walkers are regexes over minified output, so their silent failure mode
  // is finding NOTHING and scoring a payload of one small entry file — an
  // under-budget pass that means the opposite of what it says. A real graph is
  // several chunks; one file means rolldown's output shape moved.
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

  const lines = [
    '### Bundle size — eager payload (gzipped)',
    '',
    '| Graph | Size | Budget | |',
    '| --- | ---: | ---: | :-- |',
  ]

  for (const g of graphs) {
    const verdict =
      g.spare < 0 ? `❌ over by ${(-g.spare).toFixed(1)} KiB` : `✅ ${g.spare.toFixed(1)} KiB spare`

    lines.push(`| \`${g.name}\` | ${g.kib.toFixed(1)} KiB | ${g.budget} KiB | ${verdict} |`)
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

  const over = graphs.filter((g) => g.spare < 0)
  const slackFor = (g) => Math.max(g.budget * SLACK_RATIO, SLACK_FLOOR_KIB)
  const under = graphs.filter((g) => g.spare > slackFor(g))
  const name = (list) => list.map((g) => `${g.name} ${g.kib.toFixed(1)} KiB`).join('; ')

  if (under.length) {
    lines.push(
      '',
      `> 📉 ${under.map((g) => `\`${g.name}\``).join(' and ')} now ` +
        `${under.length === 1 ? 'runs' : 'run'} further under budget than ` +
        `${SLACK_RATIO * 100}% (or ${SLACK_FLOOR_KIB} KiB, whichever is larger). ` +
        'Lower `BUDGET_KIB` to lock the win in.',
    )
  }

  report(lines)

  if (over.length) {
    annotate(
      'error',
      `Bundle size over budget: ${name(over)} (budget ${over[0].budget} KiB). Either ` +
        'reduce the eager payload, or — if the growth is intended and justified — raise ' +
        'BUDGET_KIB in scripts/check-bundle-size.mjs in the same commit, with the reason ' +
        'in the commit message.',
    )
    process.exit(1)
  }

  // Failing, not nagging. A notice here would leave the budget describing a
  // payload that no longer exists, which is the same silent green the whole
  // script is aimed at — and it is also what a half-broken import walker looks
  // like, where a pass would be actively false.
  if (under.length) {
    annotate(
      'error',
      `Bundle size is far UNDER budget: ${name(under)} against ${under[0].budget} KiB. ` +
        'If the payload really shrank, lower BUDGET_KIB in scripts/check-bundle-size.mjs ' +
        'to match — a budget this loose stops detecting anything. If it did not, the ' +
        'import walker has stopped seeing part of the graph and these numbers are wrong.',
    )
    process.exit(1)
  }
}

main()
