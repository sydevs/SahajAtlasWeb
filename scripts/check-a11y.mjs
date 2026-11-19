#!/usr/bin/env node

/**
 * The blocking accessibility gate over the component library (#432).
 *
 * It drives the built library in Chromium at phone size, with a coarse pointer, and asks three
 * questions of every story:
 *
 *   1. **axe-core**, the rule set, over the story's own subtree.
 *   2. **Tap area**, probed with `document.elementFromPoint` rather than read off a class list.
 *      The widget's small controls keep their drawn size and grow an invisible touch area
 *      (`touch-target` in `globals.css`), so the drawn box is the wrong thing to measure: a
 *      32px control carrying that utility answers to a finger across 44px, and a 44px control
 *      under an overlay answers to nothing. Only a hit test tells those two apart.
 *   3. **The keyboard walk.** Every control is reached by Tab, in the order it appears in the
 *      DOM, is visible when it is reached, and paints a focus indicator — an outline, a ring,
 *      or any other computed difference from its own resting style.
 *
 * ⚠ **It is a browser and not another vitest file, and that is not a preference.** The unit
 * lane is node with a per-file jsdom opt-in, and jsdom has no layout: contrast resolves to
 * nothing and a tap area cannot be measured at all. Measured 2026-11-19 over these 52 stories:
 * the same axe configuration under jsdom returned 23 findings, this one returns 127, and none
 * of the 80 contrast failures were among the 23.
 *
 * ⚠ It reads `build/`, which `pnpm ladle:build` writes, rather than `ladle serve`. The dev
 * server compiles a story when it is opened, so a story that failed to build would pass here by
 * never having been built.
 *
 * Usage: `node scripts/check-a11y.mjs [--dir build] [--story <id>] [--origin <url>]`.
 * Exit 1 names every story that failed and what it failed on. `--origin` audits an address
 * already serving the library — `pnpm ladle` on :61000, which recompiles as you edit — and is
 * the local fix loop. CI passes neither, so it reads the build.
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { annotate, report } from './_ci-output.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The phone this gate measures against — iPhone 14's CSS viewport, the narrowest common one. */
export const PHONE = { width: 390, height: 844 }

/** WCAG 2.5.5 (AAA), the floor sydevs/WeMeditateWeb#162 held the host page to. */
export const MIN_TAP_PX = 44

/** Pixels between hit-test probes. See the note beside the probe loop for why it is not 2. */
export const PROBE_STEP_PX = 1

/**
 * `region` asks that every node sit inside a landmark. A story renders one component into a
 * bare div, so it would fail for every one of them and say nothing: the widget's own landmark
 * is the `role="region"` on the element `Widget.tsx` mounts, which no story renders.
 *
 * `landmark-unique` goes with it, for the same reason pointed the other way: a story page is a
 * CATALOGUE, so it stacks six copies of a panel the app mounts one of, and six `search`
 * landmarks named alike is a property of the page rather than of the widget.
 */
export const DISABLED_RULES = ['region', 'landmark-unique']

/**
 * Elements whose tap area may be under the floor, by selector, each with the reason. WCAG
 * 2.5.5's own exceptions are the shape of this list: a control inline in a sentence is
 * positioned by the text around it, and the sentence is what a finger aims at.
 *
 * ⚠ Keep it a selector list, never a count. A count passes again the moment something else
 * shrinks, which is the failure this gate exists to refuse.
 */
export const TAP_EXCEPTIONS = [
  {
    selector: '.colored-links a',
    reason: 'A link inside host-authored prose. Its box is the line of text it sits in.',
  },
  {
    selector: '.mapboxgl-ctrl-attrib',
    reason: "Mapbox's own attribution control, and its links. Vendor DOM, vendor geometry.",
  },
  {
    selector: '[data-radix-focus-guard]',
    reason:
      'Radix\'s own focus sentinels. They are deliberately empty and focusable, one either side of a trap.',
  },
]

/** The MIME types the preview build serves. Anything else is refused rather than guessed. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

/**
 * Serves the built library on an ephemeral port.
 *
 * A server of our own rather than `ladle preview`, so the gate owns its lifetime: a detached
 * preview that outlived a failed run would hold the port, and the next run would audit whatever
 * that one had built.
 *
 * @param {string} dir
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export async function serveDirectory(dir) {
  const root = resolve(dir)

  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    // `normalize` first, then the prefix test: a `..` segment resolves outside `root` and falls
    // through to the shell rather than reading a file the build never contained.
    const target = normalize(join(root, decodeURIComponent(path)))
    const file =
      target.startsWith(root) && extname(target) && existsSync(target)
        ? target
        : join(root, 'index.html')

    readFile(file)
      .then((body) => {
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
        res.end(body)
      })
      .catch(() => {
        res.writeHead(404).end()
      })
  })

  await new Promise((done) => server.listen({ host: '127.0.0.1', port: 0 }, () => done(undefined)))

  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((done) => server.close(() => done(undefined))),
  }
}

/**
 * The reachable span around a control's centre, in CSS pixels, from one axis of probe results.
 *
 * The probes are ordered centre-first then outward — `[centre, -1, +1, -2, +2, …]` — and the
 * walk stops at the first point on a side that does not answer with the control, so a span is
 * contiguous. A control crowded on one side reports the room it actually has, never the sum of
 * two disjoint patches.
 *
 * @param {boolean[]} hits
 * @param {number} step Pixels between probes
 */
export function spanFrom(hits, step) {
  if (!hits[0]) return 0

  let before = 0
  let after = 0

  while (hits[1 + before * 2] && before < (hits.length - 1) / 2) before += 1
  while (hits[2 + after * 2] && after < (hits.length - 1) / 2) after += 1

  return (before + after) * step + 1
}

/**
 * The findings, grouped by story, as the markdown the report prints. Separate from the browser
 * work so the shape of a failure is testable without one.
 *
 * @param {{ story: string, kind: string, detail: string }[]} failures
 */
export function formatFailures(failures) {
  /** @type {Map<string, typeof failures>} */
  const byStory = new Map()

  for (const failure of failures) {
    const list = byStory.get(failure.story) ?? []

    list.push(failure)
    byStory.set(failure.story, list)
  }

  return [...byStory.entries()].flatMap(([story, list]) => [
    `### \`${story}\``,
    '',
    ...list.map((f) => `- **${f.kind}** — ${f.detail}`),
    '',
  ])
}

/**
 * Runs in the page. Returns axe's violations, one probe grid per visible control, and the
 * tabbable inventory with each element's resting paint, which the keyboard walk compares
 * against.
 *
 * @param {{ disabledRules: string[], minTap: number, selectors: string[] }} options
 */
 
async function pageAudit({ disabledRules, minTap, selectors }) {
  const root = document.body
  const rules = {}

  for (const id of disabledRules) rules[id] = { enabled: false }

  const axeResults = await /** @type {any} */ (window).axe.run(root, {
    resultTypes: ['violations'],
    rules,
  })

  const INTERACTIVE = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="menuitemcheckbox"]',
    '[role="tab"]',
    '[role="option"]',
    '[role="slider"]',
    '[role="combobox"]',
  ].join(',')

  const describe = (el) => {
    const name = (
      el.getAttribute('aria-label') ||
      el.textContent ||
      el.getAttribute('title') ||
      el.tagName
    )
      .trim()
      .slice(0, 48)

    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}"`
  }

  const paint = (el) => {
    const s = getComputedStyle(el)

    return [s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join('|')
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)

    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'
  }

  const exempt = (el) => selectors.some((selector) => el.closest(selector))

  // One pixel per probe. At two, a 44px area centred on a fractional pixel measures 43 and the
  // gate reports a control it had just been given the room it asked for.
  const step = 1
  const reach = Math.ceil(minTap / 2)
  const probed = []

  for (const node of root.querySelectorAll(INTERACTIVE)) {
    const el = /** @type {any} */ (node)

    if (el.disabled || !visible(el) || exempt(el)) continue

    // Centred first. A probe that leaves the viewport answers `null`, so a control resting
    // against an edge would measure short for where it happened to sit rather than for how
    // big it is.
    el.scrollIntoView({ block: 'center', inline: 'center' })

    const r = el.getBoundingClientRect()
    const cx = Math.round(r.left + r.width / 2)
    const cy = Math.round(r.top + r.height / 2)
    // A label activates the control it names, so the label's own box is part of the target —
    // which is the whole tap area of a checkbox or a radio, whose drawn box is 16px by design.
    const owners = [el, ...(el.labels ?? [])]
    const owns = (x, y) => {
      if (x < 0 || y < 0 || x > window.innerWidth - 1 || y > window.innerHeight - 1) return false

      const hit = document.elementFromPoint(x, y)

      // The control itself, or something drawn inside it — a glyph, a badge, its own `::after`
      // tap area, which hit-tests as the element. An ANCESTOR is not a hit: accepting one
      // would let every control pass, since the page always has a box under the probe.
      return !!hit && owners.some((owner) => hit === owner || owner.contains(hit))
    }

    // A control the page does not hand back at its own centre is covered by something else.
    // axe owns that case, and reporting it here as a small target would name the wrong defect.
    if (!owns(cx, cy)) continue

    const axis = (horizontal) => {
      const hits = [true]

      for (let d = step; d <= reach; d += step) {
        hits.push(owns(horizontal ? cx - d : cx, horizontal ? cy : cy - d))
        hits.push(owns(horizontal ? cx + d : cx, horizontal ? cy : cy + d))
      }

      return hits
    }

    probed.push({ el: describe(el), w: axis(true), h: axis(false) })
  }

  // Every element is stamped with its position in document order, and the walk reads the stamp
  // back off whatever Tab focused. That is what lets the order be checked without ALSO
  // claiming to know which elements Tab should stop on: a roving-tabindex group (every Radix
  // toggle group, menu and select here) deliberately exposes one stop for the whole set, so a
  // list of expected stops would be wrong by construction.
  const order = new Map()
  const resting = new Map()
  let index = 0

  for (const el of root.querySelectorAll('*')) {
    el.setAttribute('data-a11y-order', String(index))
    order.set(el, index)
    resting.set(String(index), paint(el))
    index += 1
  }

  return {
    violations: axeResults.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      first: v.nodes[0]?.html.slice(0, 160) ?? '',
    })),
    probed,
    resting: Object.fromEntries(resting),
    stops: [...root.querySelectorAll(`${INTERACTIVE},[tabindex]`)]
      .map((node) => /** @type {any} */ (node))
      .filter((el) => !el.disabled && el.tabIndex >= 0 && visible(el) && !exempt(el)).length,
  }
}
 

/**
 * Presses Tab once per control the page offers and reports where focus landed: its position in
 * document order, whether it is visible there, and whether focus changed how it is painted.
 *
 * @param {import('playwright').Page} page
 * @param {number} count
 * @param {Record<string, string>} resting
 */
async function keyboardWalk(page, count, resting, selectors) {
  const stops = []

  await page.evaluate(() => document.body.focus())

  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press('Tab')

     
    const stop = await page.evaluate((exceptions) => {
      const el = document.activeElement

      if (!el || el === document.body || el === document.documentElement) return null
      // The same list the tap probe reads. Radix's focus sentinels are the reason it is
      // needed here: they are empty, invisible and deliberately focusable, one either side of
      // every trap, so every drawer and dialog would report two findings nobody can fix.
      if (exceptions.some((selector) => el.closest(selector))) return { skip: true }

      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      const name = (
        el.getAttribute('aria-label') ||
        el.textContent ||
        el.getAttribute('title') ||
        el.tagName
      )
        .trim()
        .slice(0, 48)

      return {
        el: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${name}"`,
        order: el.getAttribute('data-a11y-order'),
        visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0',
        painted: [
          s.outlineWidth,
          s.outlineColor,
          s.boxShadow,
          s.borderColor,
          s.backgroundColor,
        ].join('|'),
      }
    }, selectors)
     

    if (!stop) break
    if (stop.skip) continue

    stops.push({
      ...stop,
      // An element the audit never stamped is one the page added after it ran — a portal that
      // opened on focus. It has no resting style to compare against, so the indicator check
      // abstains rather than guessing.
      indicated:
        resting[String(stop.order)] === undefined ||
        stop.painted !== resting[String(stop.order)],
    })
  }

  return stops
}

/**
 * @param {{ dir: string, only?: string, origin?: string }} options
 */
export async function run({ dir, only, origin }) {
  const { chromium } = await import('playwright')
  const meta = origin
    ? await (await fetch(`${origin}/meta.json`)).json()
    : JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
  const ids = Object.keys(meta.stories).filter((id) => !only || id === only)
  const axeSource = readFileSync(join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')

  const site = origin
    ? { origin, close: async () => {} }
    : await serveDirectory(dir)
  const browser = await chromium.launch()
  // `isMobile` is what makes `(pointer: coarse)` match, and the `touch-target` utility is
  // written against that query — on a fine pointer every small control would be reported and
  // the gate would be measuring a device nobody taps.
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()

  /** @type {{ story: string, kind: string, detail: string }[]} */
  const failures = []
  let controls = 0

  for (const id of ids) {
    try {
      await page.goto(`${site.origin}/?story=${id}&mode=preview`, {
        waitUntil: 'load',
        timeout: 30_000,
      })
      await page.waitForTimeout(600)
      await page.addScriptTag({ content: axeSource })

      const selectors = TAP_EXCEPTIONS.map(({ selector }) => selector)
      const result = await page.evaluate(pageAudit, {
        disabledRules: DISABLED_RULES,
        minTap: MIN_TAP_PX,
        selectors,
      })

      controls += result.probed.length

      for (const violation of result.violations) {
        failures.push({
          story: id,
          kind: violation.id,
          detail: `${violation.help} — ${violation.count}× (${violation.impact}): ${violation.first}`,
        })
      }

      for (const target of result.probed) {
        const width = spanFrom(target.w, PROBE_STEP_PX)
        const height = spanFrom(target.h, PROBE_STEP_PX)

        if (width < MIN_TAP_PX || height < MIN_TAP_PX) {
          failures.push({
            story: id,
            kind: 'tap-target',
            detail: `${target.el} answers to ${width}×${height}px, under ${MIN_TAP_PX}×${MIN_TAP_PX}`,
          })
        }
      }

      let reached = -1
      const checked = new Set()

      for (const stop of await keyboardWalk(page, result.stops, result.resting, selectors)) {
        const at = Number(stop.order)

        // `<`, not `<=`: Chromium's own date field moves focus between the segments of ONE
        // input, so the same element is a stop twice in a row, and that is not an order defect.
        if (Number.isFinite(at) && at < reached) {
          failures.push({
            story: id,
            kind: 'tab-order',
            detail: `Tab went backwards to ${stop.el}, which the DOM puts before the previous stop`,
          })
          // One report per story. Past the first jump every later stop is measured against a
          // sequence that has already diverged, and the list would bury the one place it did.
          break
        }

        reached = Number.isFinite(at) ? at : reached

        if (!stop.visible) {
          failures.push({ story: id, kind: 'focus-hidden', detail: `${stop.el} is not visible` })
        }

        // One element can be several stops — Chromium walks the segments of a date input one
        // Tab at a time without leaving it, and only the first of those carries
        // `:focus-visible`. The question is whether the CONTROL shows focus, so it is asked
        // once per control.
        if (!stop.indicated && !checked.has(stop.order)) {
          failures.push({
            story: id,
            kind: 'focus-indicator',
            detail: `${stop.el} paints nothing when it is focused`,
          })
        }

        checked.add(stop.order)
      }
    } catch (error) {
      failures.push({ story: id, kind: 'render', detail: String(error).split('\n')[0] })
    }
  }

  await browser.close()
  await site.close()

  return { failures, controls, stories: ids.length }
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name, fallback) => {
    const at = args.indexOf(`--${name}`)

    return at === -1 ? fallback : args[at + 1]
  }

  const dir = option('dir', 'build')
  const origin = option('origin')

  if (!origin && !existsSync(join(dir, 'meta.json'))) {
    annotate(
      'error',
      `No component library at \`${dir}/\`. Run \`pnpm ladle:build\` first — this gate reads a build, never the dev server.`,
    )
    process.exit(1)
  }

  const { failures, controls, stories } = await run({ dir, origin, only: option('story') })

  if (failures.length === 0) {
    report([`Accessibility gate: **${stories} stories**, ${controls} controls measured, clean.`])

    return
  }

  const affected = new Set(failures.map((f) => f.story)).size

  annotate(
    'error',
    `Accessibility gate: ${failures.length} findings across ${affected} of ${stories} stories.`,
  )
  report([`## Accessibility gate — ${failures.length} findings`, '', ...formatFailures(failures)])
  process.exit(1)
}

// Lets the spec import the pure helpers without running the gate. See `assert-preview-host.mjs`
// for why both sides go through `realpathSync`.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  await main()
}
