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
 * Dynamic `import()` targets (mapbox-gl, EventDetails, the lightbox, the admin
 * PreviewController) are deliberately excluded: they are a second hop, not the
 * first-load cost. Note that the map renders at mount today, so real
 * first-meaningful-paint is closer to `standalone + mapbox-gl`. Budgeting the
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
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { annotate, report } from './_ci-output.mjs'

// ---------------------------------------------------------------------------
// THE BUDGET. One constant, deliberately easy to edit.
//
// Set just above the payload as measured on 2026-08-06 (issue #99), so this
// catches unnoticed *growth* without failing the day it lands — the current
// size is oversized for an embed, but that is a separate problem with its own
// ticket. Headroom is ~3%: enough to absorb a dependency patch bump, tight
// enough that a newly-eager view trips it.
//
//   standalone  479.5 KiB  →  495
//   embed       480.4 KiB  →  495
//
// RATCHET THIS DOWN when the payload shrinks. Issue #96 (lazy-load the calendar,
// registration and share drawers) is expected to take 150–250 KiB off both
// numbers — that PR should lower these two values in the same commit, or the
// budget quietly re-accumulates the slack it just won. `SLACK_RATIO` below says
// that out loud rather than trusting this comment to be read.
// ---------------------------------------------------------------------------
const BUDGET_KIB = {
  standalone: 495,
  embed: 495,
}

// A budget far above the real payload is a green check that checks nothing —
// the exact failure this script was written against, just slower. Once a graph
// is running this much under, the number has stopped describing the code and
// should come down.
const SLACK_RATIO = 0.1

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
    .filter((f) => existsSync(f))
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

  return hrefs.map((href) => join(DIST, href.replace(/^\//, '')))
}

/** Measure one named graph: per-file gzip sizes, sorted heaviest first. */
function measure(name, files) {
  const parts = files
    .map((file) => ({ file: relative(DIST, file), bytes: gzipBytes(file) }))
    .sort((a, b) => b.bytes - a.bytes)

  const kib = parts.reduce((sum, p) => sum + p.bytes, 0) / KIB
  const budget = BUDGET_KIB[name]

  return { name, parts, kib, budget, spare: budget - kib }
}

function main() {
  const indexHtml = join(DIST, 'index.html')
  const embedJs = join(DIST, 'embed.js')

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
  const loaded = importClosure(declared[0])

  const embedGraph = importClosure(embedJs)

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
  const slack = graphs.filter((g) => g.spare > g.budget * SLACK_RATIO)

  if (slack.length) {
    lines.push(
      '',
      `> 📉 ${slack.map((g) => `\`${g.name}\``).join(' and ')} now ` +
        `${slack.length === 1 ? 'runs' : 'run'} more than ` +
        `${SLACK_RATIO * 100}% under budget. Lower BUDGET_KIB to lock the win in.`,
    )
  }

  report(lines)

  if (over.length) {
    annotate(
      'error',
      `Bundle size over budget: ${over
        .map((g) => `${g.name} ${g.kib.toFixed(1)} KiB > ${g.budget} KiB`)
        .join('; ')}. Either reduce the eager payload, or — if the growth is ` +
        'intended and justified — raise BUDGET_KIB in scripts/check-bundle-size.mjs ' +
        'in the same commit, with the reason in the commit message.',
    )
    process.exit(1)
  }

  if (slack.length) {
    annotate(
      'notice',
      `Bundle-size budget has slack: ${slack.map((g) => g.name).join(', ')} — ratchet BUDGET_KIB down.`,
    )
  }
}

main()
