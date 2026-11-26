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
 * nothing and a tap area cannot be measured at all. Measured 2026-11-19 over these 52 stories,
 * counting violation nodes: the same axe configuration under jsdom returned 31, this one 131,
 * and the 80 contrast failures and 24 label-in-name failures were not among the 31.
 *
 * ⚠ It reads `build/`, which `pnpm ladle:build` writes, rather than `ladle serve`. The dev
 * server compiles a story when it is opened, so a story that failed to build would pass here by
 * never having been built.
 *
 * Usage: `node scripts/check-a11y.mjs [--story <id>] [--origin <url>]`.
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
import { MIME } from './_mime.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The phone this gate measures against — iPhone 14's CSS viewport, the narrowest common one. */
export const PHONE = { width: 390, height: 844 }

/** WCAG 2.5.5 (AAA), the floor sydevs/WeMeditateWeb#162 held the host page to. */
export const MIN_TAP_PX = 44

/** Pixels between hit-test probes. See the note beside the probe loop for why it is not 2. */
export const PROBE_STEP_PX = 1

/** Where the library is built, and the one directory this gate reads. */
const BUILD_DIR = 'build'

/**
 * The address the local server answers with axe-core's own bundle, so the page fetches it like
 * any other script. The two leading underscores keep it clear of anything Ladle emits.
 */
const AXE_PATH = '/__axe-core.js'

/**
 * Two of axe's own rules, turned off, each for a property of a STORY page rather than of the
 * widget. Everything axe enables by default stays on.
 *
 * `region` asks that every node sit inside a landmark. A story renders one component into a
 * bare div, so it would fail for every one of them and say nothing: the widget's own landmark
 * is the `role="region"` on the element `Widget.tsx` mounts, which no story renders.
 *
 * `landmark-unique` goes with it, pointed the other way: a story page is a CATALOGUE, so it
 * stacks six copies of a panel the app mounts one of, and six `search` landmarks named alike
 * is a property of the page.
 *
 * ⚠ **axe ships `target-size`, and this gate does not turn it on** — it is one of the handful
 * axe itself leaves disabled, along with `color-contrast-enhanced` and `duplicate-id`. It is
 * not turned on because it cannot answer the question here: it measures
 * `getBoundingClientRect`, which cannot see the absolutely-positioned `::after` the
 * `touch-target` utility draws, so it would fail every control the widget deliberately leaves
 * small — the 32px cog, the 16px slider thumb, the 12px chip close — while passing a 44px
 * control an overlay covers. The hit-test probe below is what tells those two apart. Its
 * `target-offset` companion, the crowding rule, is the same story: the areas it would measure
 * are the drawn boxes, not the ones a finger reaches.
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
      "Radix's own focus sentinels. They are deliberately empty and focusable, one either side of a trap.",
  },
]

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

    if (path === AXE_PATH) {
      readFile(join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js'))
        .then((body) => {
          res.writeHead(200, {
            'content-type': MIME['.js'],
            'cache-control': 'public, max-age=31536000, immutable',
          })
          res.end(body)
        })
        .catch(() => {
          res.writeHead(404).end()
        })

      return
    }

    // `normalize` first, then the prefix test: a `..` segment resolves outside `root` and falls
    // through to the shell rather than reading a file the build never contained.
    const target = normalize(join(root, decodeURIComponent(path)))
    const file =
      target.startsWith(root) && extname(target) && existsSync(target)
        ? target
        : join(root, 'index.html')

    readFile(file)
      .then((body) => {
        res.writeHead(200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
          // Every asset name is content-hashed, so this is the same promise `public/_headers`
          // makes in production. Without it the browser revalidates on all 52 navigations and
          // re-compiles a ~950 KB shell each time, because an unvalidatable response cannot
          // enter V8's code cache either.
          'cache-control': file.includes('/assets/')
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        })
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

  // Indexing past the end answers `undefined`, which ends the walk, so neither side needs a
  // bound of its own. The two sides differ only in where they start.
  const run = (start) => {
    let reached = 0

    while (hits[start + reached * 2]) reached += 1

    return reached
  }

  return (run(1) + run(2)) * step + 1
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
 * Names every control the probe could not measure, grouped by story.
 *
 * @param {{ story: string, el: string }[]} unmeasured
 * @returns {string[]} Report lines, empty when every control was measured.
 */
export function formatUnmeasured(unmeasured) {
  if (unmeasured.length === 0) return []

  return [
    '',
    `## Unmeasured — ${unmeasured.length} control(s) against a viewport edge`,
    '',
    `A probe off the viewport answers \`null\`, so the ${MIN_TAP_PX}px floor did not apply to these.`,
    '',
    ...formatFailures(
      unmeasured.map(({ story, el }) => ({ story, kind: 'unmeasured', detail: el })),
    ),
  ]
}

/**
 * Runs in the page. Returns axe's violations, one probe grid per visible control, and the
 * tabbable inventory with each element's resting paint, which the keyboard walk compares
 * against.
 *
 * @param {{ disabledRules: string[], minTap: number, selectors: string[], step: number }} options
 */

async function pageAudit({ disabledRules, minTap, selectors, step }) {
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
  const tabbable = (el) => !el.disabled && el.tabIndex >= 0 && visible(el) && !exempt(el)

  // ⚠ Left on the page for the keyboard walk's own `evaluate`, which runs next without a
  // navigation between. `page.evaluate` serialises the function it is given, so a helper
  // cannot be closed over — and `paint` in particular MUST be the same function on both
  // sides: the walk's verdict is `painted !== resting[order]`, so two lists that drifted
  // apart by one property would report a focus indicator on every control, for ever, with
  // nothing failing.
  const shared = /** @type {any} */ (window)

  // `stops` is also the tripwire's recount, so the two counts cannot be taken two ways.
  const stops = () =>
    [...root.querySelectorAll(`${INTERACTIVE},[tabindex]`)]
      .map((node) => /** @type {any} */ (node))
      .filter(tabbable)

  shared.__a11y = { describe, paint, visible, tabbable, stops }

  // ⚠ The window reaches a whole tap area either side, not half of one. The centre it walks out
  // from is the CONTROL's, and what it measures is the `touch-target` `::after` around it, so the
  // two part company by a fraction of a pixel — which costs the outermost probe on one side and
  // reports 43 for an area that is exactly 44. Measured on `atoms--inputs--checkbox`: the
  // control's centre on 421.86, its area on [399, 443). A window wide enough to find both ends
  // of the run measures the area wherever its centre sits, so no story needs slack of its own.
  const reach = minTap
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
    const inView = (x, y) =>
      x >= 0 && y >= 0 && x <= window.innerWidth - 1 && y <= window.innerHeight - 1

    const owns = (x, y) => {
      if (!inView(x, y)) return false

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
      // ⚠ Whether the run ENDED on a point off the VIEWPORT, which is not the same as being
      // covered. `scrollIntoView` cannot centre a control the page has no room to scroll past,
      // so a control resting against a clamped edge has probe points off screen — and an
      // off-screen point answers `null`, which would read as a crowded control and fail a
      // required check for where it happened to sit. A point past the end of a run changes no
      // measurement, so only the point that ended a side is asked.
      let clipped = false
      // Each side stops at its own first miss, which is also what bounds the probe count now
      // that the window is twice the area.
      const open = [true, true]

      for (let d = step; d <= reach && (open[0] || open[1]); d += step) {
        const points = horizontal
          ? [
              [cx - d, cy],
              [cx + d, cy],
            ]
          : [
              [cx, cy - d],
              [cx, cy + d],
            ]

        for (const [side, [x, y]] of points.entries()) {
          const hit = open[side] && owns(x, y)

          if (open[side] && !hit) {
            clipped = clipped || !inView(x, y)
            open[side] = false
          }

          hits.push(hit)
        }
      }

      return { hits, clipped }
    }

    const w = axis(true)
    const h = axis(false)

    probed.push({ el: describe(el), w: w.hits, h: h.hits, clipped: w.clipped || h.clipped })
  }

  // Every element is stamped with its position in document order, and the walk reads the stamp
  // back off whatever Tab focused. That is what lets the order be checked without ALSO
  // claiming to know which elements Tab should stop on: a roving-tabindex group (every Radix
  // toggle group, menu and select here) deliberately exposes one stop for the whole set, so a
  // list of expected stops would be wrong by construction.
  // The stamp goes on every element, because the order comparison is against document order.
  // The resting paint does not: only an element Tab can land on is ever looked up, and
  // resolving a computed style for every node of every story buys nothing.
  const resting = new Map()
  let index = 0

  for (const node of root.querySelectorAll('*')) {
    const el = /** @type {any} */ (node)

    el.setAttribute('data-a11y-order', String(index))
    if (tabbable(el)) resting.set(String(index), paint(el))
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
    stops: stops().length,
  }
}

/** How long the DOM must sit still before a story counts as rendered, and the cap on waiting. */
const QUIET_MS = 250
const SETTLE_CAP_MS = 4000

/**
 * The widget's own loading placeholder: `LOADING_ATTR` in `src/components/organisms/Skeleton`,
 * duplicated because a script cannot import a `.tsx`, and pinned to it by the spec.
 */
export const LOADING_SELECTOR = '[data-sy-loading]'

/**
 * Stories whose subject IS a loading placeholder, so the wait does not hold out for it to go.
 * Every other story still showing one at the cap is reported as unsettled.
 */
export const PLACEHOLDER_STORIES = [
  {
    story: 'organisms--skeleton',
    reason: 'The placeholder catalogue itself. Its skeletons never resolve, by design.',
  },
]

/**
 * Waits until the story has stopped changing.
 *
 * ⚠ **A fixed sleep and a "has it rendered anything" check are both wrong here, and the second
 * one is wrong in the way that matters.** `#ladle-root` gains a child long before a component
 * that themes itself on mount has painted — `views--calendar` reported 28 contrast failures
 * against Schedule-X's own default palette that way, every run, because the gate looked while
 * the calendar was still unthemed. A quiet period answers the question actually being asked:
 * nothing has changed for a while, so what is on screen is what a visitor would see. Fonts are
 * waited on for the same reason, since a contrast verdict is taken against painted text.
 *
 * ⚠ **The quiet window may not close before the story has mutated the page once.** `load`
 * fires before React mounts, so a run that looked during that gap found the page quiet because
 * nothing had started, and audited an empty body: measured over the 52 stories, the tap probe
 * reached between 1 and 126 controls across runs on one unchanged tree, and axe reported no
 * violation either way — green having read nothing. The cap still bounds a story that never
 * mutates.
 *
 * ⚠ **Nor may it close while a loading placeholder is on the page** (#515). A view whose body is
 * a lazy chunk draws its skeleton first and its content when the chunk arrives, and the gap
 * between them outlasted the quiet window: `views--event-·-sticky-register` draws 2 controls at
 * ~300ms and 12 at ~600ms (measured 2026-11-26), so the audit read 2 stops on one run and 12 on
 * the next. A longer window only moves that race onto a slower machine.
 *
 * @param {import('playwright').Page} page
 * @param {{ requireChange: boolean, waitForLoading: boolean }} options
 * @returns {Promise<{ loading: number }>} Placeholders still on the page when the wait ended.
 */
async function settled(page, { requireChange, waitForLoading }) {
  return page.evaluate(
    ([quiet, cap, selector, change, loadingBlocks]) =>
      new Promise((done) => {
        let timer
        const loading = () => document.querySelectorAll(selector).length
        // A quiet page still holding a placeholder keeps waiting: the mutation that swaps it for
        // the content restarts the window.
        const quietly = () => {
          if (!loadingBlocks || loading() === 0) finish()
        }
        const observer = new MutationObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(quietly, quiet)
        })

        function finish() {
          observer.disconnect()
          clearTimeout(timer)
          clearTimeout(ceiling)
          document.fonts.ready.then(() => requestAnimationFrame(() => done({ loading: loading() })))
        }

        const ceiling = setTimeout(finish, cap)

        observer.observe(document.body, { childList: true, subtree: true, attributes: true })
        if (!change) timer = setTimeout(quietly, quiet)
      }),
    /** @type {const} */ ([
      QUIET_MS,
      SETTLE_CAP_MS,
      LOADING_SELECTOR,
      requireChange,
      waitForLoading,
    ]),
  )
}

/**
 * Whether the page the audit read is still the page on screen, asked after settling a second
 * time: the stops Tab can reach now against the count the audit took, and any control the audit
 * never stamped. A difference is a story audited before it finished rendering (#515), which
 * would otherwise pass or fail on a partial read with nothing saying so.
 *
 * @param {{ stops: number }} audit
 * @param {{ stops: number, unstamped: number, loading: number }} now
 * @param {boolean} placeholderStory
 * @returns {string | null} The finding's detail, or `null` when the read was whole.
 */
export function unsettledDetail(audit, now, placeholderStory) {
  const problems = []

  if (now.loading > 0 && !placeholderStory) {
    problems.push(
      `${now.loading} loading placeholder(s) still on the page after ${SETTLE_CAP_MS}ms`,
    )
  }
  if (now.stops !== audit.stops) {
    problems.push(`${audit.stops} tab stop(s) at the audit, ${now.stops} after settling again`)
  }
  if (now.unstamped > 0) problems.push(`${now.unstamped} control(s) rendered after the audit`)

  return problems.length === 0
    ? null
    : `audited before it finished rendering — ${problems.join('; ')}. No other verdict is reported for it.`
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
      const el = /** @type {any} */ (document.activeElement)

      if (!el || el === document.body || el === document.documentElement) return null
      // The same list the tap probe reads. Radix's focus sentinels are the reason it is
      // needed here: they are empty, invisible and deliberately focusable, one either side of
      // every trap, so every drawer and dialog would report two findings nobody can fix.
      if (exceptions.some((selector) => el.closest(selector))) return { skip: true }

      const { describe, paint, visible } = /** @type {any} */ (window).__a11y

      return {
        el: describe(el),
        order: el.getAttribute('data-a11y-order'),
        visible: visible(el),
        painted: paint(el),
      }
    }, selectors)

    if (!stop) break
    if (stop.skip) continue
    // Back on the first stop: Tab wrapped round, so the walk is complete. `count` is the
    // tabbable elements, and a roving-tabindex group (the weekday picker) is one Tab stop holding
    // several, so the walk can outlast the page and wrap without passing the body.
    if (
      stops.length > 0 &&
      stop.order === stops[0].order &&
      stops[stops.length - 1].order !== stop.order
    ) {
      break
    }

    stops.push({
      ...stop,
      // An element the audit never stamped is one the page added after it ran — a portal that
      // opened on focus. It has no resting style to compare against, so the indicator check
      // abstains rather than guessing.
      indicated:
        resting[String(stop.order)] === undefined || stop.painted !== resting[String(stop.order)],
    })
  }

  return stops
}

/**
 * @param {{ only?: string, origin?: string }} options
 */
export async function run({ only, origin } = {}) {
  const { chromium } = await import('playwright')
  const selectors = TAP_EXCEPTIONS.map(({ selector }) => selector)

  // One address, whether this run serves the build or was pointed at a dev server, so the
  // story list and the pages come from the same place by construction.
  const site = origin ? { origin, close: async () => {} } : await serveDirectory(BUILD_DIR)
  // ⚠ Why a server of ours and two injection paths, rather than `@axe-core/playwright`: that
  // package injects axe's source through the debugging protocol into every frame, which is the
  // 650 KB the `url` branch below exists to avoid, 52 times over. It also audits only axe, and
  // two of this gate's three checks are the tap probe and the keyboard walk, which need the
  // page either way. So the dependency would serve the one path we deliberately do not take.
  //
  // A dev server knows nothing of `AXE_PATH`, so the fix loop pays the inline cost the gate
  // does not. It audits one story at a time, where 650 KB over the protocol is not worth a
  // second server to avoid.
  const axeTag = origin
    ? { content: readFileSync(join(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8') }
    : { url: AXE_PATH }
  const meta = await (await fetch(`${site.origin}/meta.json`)).json()
  const ids = Object.keys(meta.stories).filter((id) => !only || id === only)
  // `channel: 'chromium'` launches the full browser, which the browser lane drives too, so one
  // warmed cache entry serves both CI consumers. The default launches the headless shell, a
  // download of its own under the same directory (#459).
  const browser = await chromium.launch({ channel: 'chromium' })
  // `isMobile` is what makes `(hover: none) and (pointer: coarse)` match, and the
  // `touch-target` utility is written against that query — on a fine pointer every small control
  // would be reported and the gate would be measuring a device nobody taps.
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()

  /** @type {{ story: string, kind: string, detail: string }[]} */
  const failures = []
  /** @type {{ story: string, el: string }[]} */
  const unmeasured = []
  let controls = 0

  for (const id of ids) {
    try {
      await page.goto(`${site.origin}/?story=${id}&mode=preview`, {
        waitUntil: 'load',
        timeout: 30_000,
      })
      const placeholderStory = PLACEHOLDER_STORIES.some(({ story }) => story === id)

      await settled(page, { requireChange: true, waitForLoading: !placeholderStory })
      // ⚠ By URL, never `content`. axe-core is 650 KB, and inlining it would push that
      // through the debugging protocol and recompile it once per story — 34 MB and 52
      // compiles across this run. A URL is fetched from the server above, cached, and
      // compiled once.
      await page.addScriptTag(axeTag)

      const result = await page.evaluate(pageAudit, {
        disabledRules: DISABLED_RULES,
        minTap: MIN_TAP_PX,
        selectors,
        step: PROBE_STEP_PX,
      })

      const { loading } = await settled(page, {
        requireChange: false,
        waitForLoading: !placeholderStory,
      })
      const now = await page.evaluate(() => {
        const found = /** @type {any} */ (window).__a11y.stops()

        return {
          stops: found.length,
          unstamped: found.filter((el) => !el.hasAttribute('data-a11y-order')).length,
        }
      })
      const unsettled = unsettledDetail(result, { ...now, loading }, placeholderStory)

      if (unsettled) {
        failures.push({ story: id, kind: 'unsettled', detail: unsettled })
        continue
      }

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

        if (width >= MIN_TAP_PX && height >= MIN_TAP_PX) continue

        // A control whose probes left the viewport was not measured, and reporting it as
        // short would be reporting where it sat rather than how big it is. ⚠ Each one is
        // NAMED rather than counted: the shape that lands here — a control narrower than 44px
        // pinned to a corner — is the shape this floor exists to catch, so a number alone
        // cannot say whether the floor quietly stopped applying to a story.
        if (target.clipped) {
          unmeasured.push({ story: id, el: target.el })
          continue
        }

        failures.push({
          story: id,
          kind: 'tap-target',
          detail: `${target.el} answers to ${width}×${height}px, under ${MIN_TAP_PX}×${MIN_TAP_PX}`,
        })
      }

      let reached = -1
      const checked = new Set()

      for (const stop of await keyboardWalk(page, result.stops, result.resting, selectors)) {
        // ⚠ An unstamped stop (rendered after the audit) has no place in document order, and
        // `Number(null)` is 0, which would read as a jump back to the top.
        const at = stop.order === null ? NaN : Number(stop.order)

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

  return { failures, controls, unmeasured, stories: ids.length }
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name, fallback) => {
    const at = args.indexOf(`--${name}`)

    return at === -1 ? fallback : args[at + 1]
  }

  const origin = option('origin')

  if (!origin && !existsSync(join(BUILD_DIR, 'meta.json'))) {
    annotate(
      'error',
      `No component library at \`${BUILD_DIR}/\`. Run \`pnpm ladle:build\` first — this gate reads a build, never the dev server.`,
    )
    process.exit(1)
  }

  const { failures, controls, unmeasured, stories } = await run({ origin, only: option('story') })
  const aside = formatUnmeasured(unmeasured)

  // A warning, not a failure: a control the page has no room to scroll past is pinned where it
  // sits, and failing on that would red the gate for a layout rather than for a tap area. The
  // annotation is what carries it onto the run, where a summary nobody opens cannot hide it.
  if (unmeasured.length > 0) {
    annotate(
      'warning',
      `Accessibility gate: ${unmeasured.length} control(s) sat against a viewport edge, so the ${MIN_TAP_PX}px floor did not apply to them. They are named in the job summary.`,
    )
  }

  if (failures.length === 0) {
    report([
      `Accessibility gate: **${stories} stories**, ${controls} controls measured, clean.`,
      ...aside,
    ])

    return
  }

  const affected = new Set(failures.map((f) => f.story)).size

  annotate(
    'error',
    `Accessibility gate: ${failures.length} findings across ${affected} of ${stories} stories.`,
  )
  report([
    `## Accessibility gate — ${failures.length} findings`,
    '',
    `${stories} stories, ${controls} controls measured.`,
    '',
    ...formatFailures(failures),
    ...aside,
  ])
  process.exit(1)
}

// Lets the spec import the pure helpers without running the gate. See `assert-preview-host.mjs`
// for why both sides go through `realpathSync`.
const invokedAs = process.argv[1]

if (invokedAs && realpathSync(invokedAs) === realpathSync(fileURLToPath(import.meta.url))) {
  await main()
}
