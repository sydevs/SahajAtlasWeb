#!/usr/bin/env node
/**
 * A post-build gate: `dist/auto.js` must work as a classic script.
 *
 * Wix's Custom Element writes `<script src="…/auto.js?key=…">` with no `type`, so the file every
 * host installs is executed as a classic script there (`src/loader/bridge.ts`). Two defects break
 * that, and neither shows anywhere else: the module hosts keep working, the size budget barely
 * moves, and the smoke lane only fetches. So this runs the built bytes the way a browser would,
 * in a `vm` context with a stub page:
 *
 *   1. **It compiles as a script, not a module.** An `import`, an `export` or `import.meta` is a
 *      syntax error there, so nothing of the widget runs and nothing of ours can say why.
 *   2. **It starts the loader**: one `type="module"` script for `loader.js`, beside `auto.js`,
 *      carrying the host's query string and nonce — read once as a classic script, then as a
 *      module, where `document.currentScript` is null.
 *   3. **It declares nothing on the host's global object.** Run twice in one context, a top-level
 *      `let` or `const` throws, as it would beside a host script declaring the same minified name.
 *      A `var`, a function or an assignment shows up as a new global.
 *
 * Run by `pnpm build`, so a deploy whose bridge would not parse never reaches Workers.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import vm from 'node:vm'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')

/**
 * The only globals the built bridge may leave behind: the debug-ID snippet `@sentry/vite-plugin`
 * prepends to every chunk of a credentialed build. `vite.config.ts` accepts both, and says why.
 */
export const ACCEPTED_GLOBALS = ['_sentryDebugIds', '_sentryDebugIdIdentifier']

const HOST_SRC = 'https://atlas.example/auto.js?key=k&map=false'
const EXPECTED_LOADER = 'https://atlas.example/loader.js?key=k&map=false'
const NONCE = 'n0nce'

/**
 * Runs `code` once against a stub page and reports what it did.
 *
 * `asModule` reproduces a `type="module"` tag: `document.currentScript` is null, and only the
 * `script[src*="auto.js"]` lookup finds the host's tag. `tag: null` is a page with no such tag.
 *
 * @param {vm.Script} script
 * @param {vm.Context} context
 * @param {{ asModule?: boolean, tag?: object | null }} [page]
 */
export function runBridge(script, context, { asModule = false, tag } = {}) {
  const host = tag === undefined ? { src: HOST_SRC, nonce: NONCE } : tag
  const appended = []
  const errors = []

  context.document = {
    currentScript: asModule ? null : host,
    querySelector: (selector) => (selector === 'script[src*="auto.js"]' ? host : null),
    createElement: (name) => ({ nodeName: name.toUpperCase() }),
    head: { appendChild: (node) => appended.push(node) },
  }
  context.console = { error: (...args) => errors.push(args.map(String).join(' ')) }
  script.runInContext(context)

  return { appended, errors }
}

/**
 * The whole audit, as a pure function of the emitted code. Returns what is wrong, or `[]`.
 *
 * @param {string} code
 * @returns {string[]}
 */
export function auditBridge(code) {
  let script

  try {
    script = new vm.Script(code, { filename: 'auto.js' })
  } catch (error) {
    return [`auto.js does not parse as a classic script — ${error}`]
  }

  const failures = []
  const context = vm.createContext({ URL })
  const before = new Set(Object.keys(context))

  for (const asModule of [false, true]) {
    const as = asModule ? 'a module' : 'a classic script'
    let run

    try {
      run = runBridge(script, context, { asModule })
    } catch (error) {
      const redeclared = /already been declared/.test(String(error))

      failures.push(
        `auto.js threw when run as ${as} — ${error}` +
          (redeclared
            ? '. A top-level `let`, `const` or `class` lands in the host page’s global scope. ' +
              'Keep every binding inside the IIFE in src/loader/bridge.ts.'
            : ''),
      )
      continue
    }

    const [loader, ...extra] = run.appended

    if (run.errors.length) failures.push(`auto.js logged an error as ${as}: ${run.errors[0]}`)
    if (!loader || extra.length) {
      failures.push(`auto.js inserted ${run.appended.length} element(s) as ${as}, not one script`)
    } else if (
      loader.nodeName !== 'SCRIPT' ||
      loader.type !== 'module' ||
      loader.src !== EXPECTED_LOADER ||
      loader.nonce !== NONCE
    ) {
      failures.push(
        `auto.js inserted the wrong loader as ${as}: ` +
          `${JSON.stringify({ ...loader })}, expected a module script for ${EXPECTED_LOADER} ` +
          `carrying nonce ${NONCE}`,
      )
    }
  }

  const leaked = Object.keys(context).filter(
    (name) => !before.has(name) && !['document', 'console', ...ACCEPTED_GLOBALS].includes(name),
  )

  if (leaked.length) {
    failures.push(
      `auto.js leaves ${leaked.join(', ')} on the host page’s global object. ` +
        'Keep every binding inside the IIFE in src/loader/bridge.ts.',
    )
  }

  return failures
}

function fail(message) {
  console.error(`\n✗ assert-classic-bridge: ${message}\n`)
  process.exit(1)
}

// A spec imports this module for its exports, and must not run the gate on a missing `dist/`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const missing = ['auto.js', 'loader.js'].filter((file) => !existsSync(join(DIST, file)))

  if (missing.length) {
    fail(
      `no ${missing.map((file) => `dist/${file}`).join(' or ')} — run the build first, or ` +
        'update this gate if vite.config.ts renamed an entry',
    )
  }

  const failures = auditBridge(readFileSync(join(DIST, 'auto.js'), 'utf8'))

  if (failures.length) fail(failures.join('\n\n  '))

  console.log(
    '✓ assert-classic-bridge: auto.js runs as a classic script and as a module, starts ' +
      'loader.js, and declares nothing global',
  )
}
