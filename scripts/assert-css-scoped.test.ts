import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

import {
  auditBuild,
  collectVars,
  countInjectionSites,
  extractInjectedCss,
  fontFaceFailures,
  forbiddenOrigins,
  keyframeFailures,
  propertyFailures,
  remLengths,
  scopeFailures,
  varFailures,
} from './assert-css-scoped.mjs'
import scopeWidgetCss from './postcss-scope-widget.mjs'

/**
 * The gate reads CSS back out of built JavaScript, so every check in it rests on a shape some
 * other tool emits: the injector's call, the minifier's quoting, Tailwind's `@property` rules.
 * Each fails by going quiet, and a healthy build cannot show that. These cases hand each check a
 * build that passes it and one that differs by a single defect.
 */

/**
 * The stringified sink exactly as it reaches a chunk, read off `dist/assets/lightbox-*.js`
 * (vite 8.3.8, rolldown 1.2.19). ⚠ The gate anchors on this text, so a paraphrase here would
 * test the fixture: re-read it off a build if `styleSink` in `vite.config.ts` changes.
 */
const SINK =
  '(function(){((e,t)=>{let n=globalThis,r=n.__syAtlasCss||={chunks:[],listeners:[]},' +
  'i=t&&t.attributes,a=i&&i[`data-vite-dev-id`]||null,o=a?r.chunks.find(e=>e.id===a):void 0;' +
  'o?o.css=e:r.chunks.push({id:a,css:e});for(let e of r.listeners)e()})'

/** One injection site: the minifier writes the sheet as a template literal. */
const inject = (css: string) => `${SINK}(\`${css.replace(/[\\`]|\$\{/g, '\\$&')}\`,{})})();`

/** The app's sheet in miniature: one of everything the gate reads, as the minifier spells it. */
const APP =
  '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}' +
  ':where(.sy-atlas){--color-primary-9:#3e63dd}' +
  ':where(.sy-atlas) .shadow{box-shadow:var(--tw-shadow)}' +
  ':where(.sy-atlas) .text-primary{color:var(--color-primary-9)}' +
  '@media (width>=40rem){:where(.sy-atlas) .sm\\:w-80{width:320px}}' +
  '@keyframes sy-atlas-spin{to{transform:rotate(360deg)}}'

/** A lazy chunk's own sheet, injected when that chunk loads. */
const CALENDAR =
  ':where(.sy-atlas){--sy-agenda:4px}' +
  ':where(.sy-atlas) :is(.grid .cell){border-width:2px 2px 0 0}' +
  ':where(.sy-atlas) .cell{top:var(--sy-agenda)}'

const SHEET = 'dist/assets/sheet-BSYtLEmB.js'
const CALENDAR_CHUNK = 'dist/assets/CalendarView-IdZs4xkT.js'
const EMBED = 'dist/embed.js'

const chunk = (css: string) => `${inject(css)}\nimport{a as e}from"./rolldown-runtime-BWaJ3C7D.js";`

/** A build that passes every check, so each defect below differs from it by one thing. */
const GOOD: Record<string, string> = {
  'dist/index.html': '<html class="sy-atlas"><div id="syatlas"></div></html>',
  'dist/assets/rethink-sans-latin-wght-normal-B92CQIW4.woff2': 'wOF2',
  [EMBED]: 'import{t as e}from"./assets/sheet-BSYtLEmB.js";customElements.define(`sahaj-atlas`,e);',
  [SHEET]: chunk(APP),
  [CALENDAR_CHUNK]: chunk(CALENDAR),
}

const audit = (build: Record<string, string>) => {
  const failures: string[] = []
  const totals = auditBuild(
    Object.keys(build),
    (file) => build[file],
    (message) => failures.push(message),
  )

  return { failures, ...totals }
}

/** GOOD with `css` added to the app's sheet. */
const withApp = (css: string) => ({ ...GOOD, [SHEET]: chunk(APP + css) })

const parse = (css: string) => postcss.parse(css, { from: SHEET })

describe('auditBuild', () => {
  // The counts are the proof this is not an empty pass: both sheets were found, parsed, and
  // read by every walk.
  it('passes a build carrying one of everything the gate reads', () => {
    expect(audit(GOOD)).toEqual({ failures: [], sheets: 2, rules: 7, properties: 1, varRefs: 3 })
  })

  // The command line exits on the first call, so the first is the whole report.
  it('reports failures in the order a run meets them', () => {
    const { failures } = audit({
      ...withApp('main{color:red}:where(.sy-atlas) .x{width:1rem;color:var(--undeclared)}'),
      'dist/assets/stray-AAAAAAAA.css': '.a{color:red}',
      [EMBED]: `${GOOD[EMBED]}fetch(\`https://fonts.gstatic.com/s/raleway.woff2\`);`,
    })

    expect(failures).toEqual([
      expect.stringContaining('stray-AAAAAAAA.css: CSS emitted as a separate asset'),
      expect.stringContaining(`${EMBED} ships a request to fonts.gstatic.com`),
      expect.stringContaining('selector is not confined to the host-page scope'),
      expect.stringContaining(`${SHEET}: 1 rem length(s)`),
      expect.stringContaining(`${SHEET}: 1 declaration(s) reference a custom property`),
    ])
  })
})

describe('check 1: every selector is confined to the widget scope', () => {
  it('rejects a bare selector, which would style the host page', () => {
    expect(audit(withApp('main{color:red}')).failures).toEqual([
      expect.stringMatching(/sheet-BSYtLEmB\.js: .*not confined to the host-page scope.*: main$/),
    ])
  })

  it('rejects one leaked selector in an otherwise scoped list', () => {
    expect(
      audit(withApp(':where(.sy-atlas) .a,.swiper-pagination-bullet{opacity:1}')).failures,
    ).toEqual([expect.stringMatching(/not confined.*: \.swiper-pagination-bullet$/)])
  })

  it('counts the rules it read, and none for a sheet it refused', () => {
    expect(scopeFailures(parse(APP))).toEqual({ rules: 4, failures: [] })
    expect(scopeFailures(parse('a{color:red}')).rules).toBe(0)
  })
})

describe('check 2: every @keyframes name is namespaced', () => {
  it('rejects a bare name, which would replace a host animation of that name', () => {
    expect(audit(withApp('@keyframes fadeIn{0%{opacity:0}to{opacity:1}}')).failures).toEqual([
      `${SHEET}: @keyframes fadeIn is not namespaced — it would override a host animation`,
    ])
  })

  it('rejects a vendor-prefixed one too', () => {
    expect(keyframeFailures(parse('@-webkit-keyframes spin{to{transform:rotate(1turn)}}'))).toEqual(
      [expect.stringContaining('@keyframes spin is not namespaced')],
    )
  })

  it('accepts the namespace the scoping pass writes', () => {
    expect(keyframeFailures(parse('@keyframes sy-atlas-fadeIn{to{opacity:1}}'))).toEqual([])
  })
})

// The gate reads the scoping pass's result back rather than trusting it, so the two have to
// agree on what confined and namespaced mean. A change to either that the other does not follow
// fails here, on the edit, instead of at the next build.
describe('the scoping pass checks 1 and 2 read back', () => {
  const SOURCE =
    'main{color:red}:root{--x:1}.dark{--x:2}.a{animation:fadeIn 1s}@keyframes fadeIn{to{opacity:1}}'

  it('accepts what postcss-scope-widget.mjs writes', async () => {
    const { css } = await postcss([scopeWidgetCss()]).process(SOURCE, { from: undefined })
    const root = parse(css)

    expect(scopeFailures(root)).toEqual({ rules: 4, failures: [] })
    expect(keyframeFailures(root)).toEqual([])
  })

  it('refuses the same sheet before the pass has run', () => {
    expect(scopeFailures(parse(SOURCE)).failures).toHaveLength(1)
    expect(keyframeFailures(parse(SOURCE))).toHaveLength(1)
  })
})

describe('check 3: no request to a third-party font CDN', () => {
  it('rejects a CSS @import of the font inside an injected sheet', () => {
    const build = withApp('@import url(https://fonts.googleapis.com/css2?family=Raleway);')

    expect(audit(build).failures).toEqual([
      `${SHEET} ships a request to fonts.googleapis.com — the font must stay self-hosted`,
    ])
  })

  // The faces are registered from JS now, so the regression has a second way back in that no
  // stylesheet shows.
  it('rejects a plain URL in a chunk that injects no CSS at all', () => {
    const build = {
      ...GOOD,
      [EMBED]: `${GOOD[EMBED]}new FontFace(\`Raleway\`,\`url(https://fonts.gstatic.com/s/raleway.woff2)\`);`,
    }

    expect(audit(build).failures).toEqual([
      `${EMBED} ships a request to fonts.gstatic.com — the font must stay self-hosted`,
    ])
  })

  it('accepts a face served from our own origin', () => {
    const selfHosted =
      'new FontFace(`Atlas Rethink Sans`,`url(${new URL(`assets/rethink-sans-latin-wght-normal-B92CQIW4.woff2`,import.meta.url)})`);'

    expect(forbiddenOrigins(selfHosted)).toEqual([])
    expect(audit({ ...GOOD, [EMBED]: GOOD[EMBED] + selfHosted }).failures).toEqual([])
  })
})

describe('check 4: no rem in any sheet', () => {
  it('rejects a rem length in any other sheet, and names the declaration', () => {
    expect(audit(withApp(':where(.sy-atlas) .w-4{width:1rem}')).failures).toEqual([
      expect.stringMatching(
        /^dist\/assets\/sheet-BSYtLEmB\.js: 1 rem length\(s\) — [\s\S]*\n {2}:where\(\.sy-atlas\) \.w-4 \{ width: 1rem \}$/,
      ),
    ])
  })

  it('rejects a rem length in a lazy chunk’s sheet too', () => {
    const { failures } = audit({
      ...GOOD,
      [CALENDAR_CHUNK]: chunk(`${CALENDAR}:where(.sy-atlas) .x{width:1rem}`),
    })

    expect(failures).toEqual([expect.stringContaining(`${CALENDAR_CHUNK}: 1 rem length(s)`)])
  })

  it('reads a sign, a fraction and either case as a length', () => {
    const found = remLengths(
      parse('.a{margin:-.5rem 0}.b{width:1.25rem}.c{height:2REM}.d{inset:calc(100% - 1rem)}'),
    )

    expect(found).toEqual([
      '.a { margin: -.5rem 0 }',
      '.b { width: 1.25rem }',
      '.c { height: 2REM }',
      '.d { inset: calc(100% - 1rem) }',
    ])
  })

  // A media query's rem is the browser's initial font size, which no host stylesheet can move.
  it('reads no length in a media query, an identifier, a string or a url', () => {
    const css =
      '@media (width>=40rem){.a{width:320px}}' +
      '.b{margin:var(--gap-2rem,0)}' +
      '.c{content:"1rem"}' +
      '.d{background:url(tile-2rem.png)}' +
      '.e{transition:transform .2s}'

    expect(remLengths(parse(css))).toEqual([])
  })
})

describe('check 5: every fallbackless var() names a declared property', () => {
  it('rejects a reference to a property nothing in the build declares', () => {
    const { failures } = audit(withApp(':where(.sy-atlas) .x{color:var(--nothing-declares-this)}'))

    expect(failures).toEqual([
      expect.stringMatching(
        /^dist\/assets\/sheet-BSYtLEmB\.js: 1 declaration\(s\) reference a custom property nothing this build ships declares[\s\S]*\n {2}--nothing-declares-this {2}<- {2}:where\(\.sy-atlas\) \.x \{ color \}$/,
      ),
    ])
  })

  // A custom property resolves per element and every sheet styles the same subtree, so the
  // declaration may sit in a different chunk from the reference.
  it('accepts a property another chunk’s sheet declares', () => {
    const build = {
      ...GOOD,
      [CALENDAR_CHUNK]: chunk(`${CALENDAR}:where(.sy-atlas) .sx__x{color:var(--color-primary-9)}`),
    }

    expect(audit(build)).toMatchObject({ failures: [], varRefs: 4 })
  })

  it('accepts a fallback, a registered property and a library’s runtime-set prefix', () => {
    const css =
      '@property --tw-ring-color{syntax:"*";inherits:false}' +
      '.a{color:var(--undeclared,red)}' +
      '.b{outline-color:var(--tw-ring-color)}' +
      '.c{width:var(--radix-popover-trigger-width)}'
    const { declared, refs } = collectVars(parse(css))

    // The fallback form is not a reference at all: it cannot go invalid.
    expect(refs.map(({ name }) => name)).toEqual([
      '--tw-ring-color',
      '--radix-popover-trigger-width',
    ])
    expect(varFailures([{ file: SHEET, refs }], declared)).toEqual([])
  })

  it('does not take a prefix that only resembles a library’s', () => {
    const { declared, refs } = collectVars(parse('.a{width:var(--radixish-width)}'))

    expect(varFailures([{ file: SHEET, refs }], declared)).toEqual([
      expect.stringContaining('--radixish-width  <-  .a { width }'),
    ])
  })

  it('fails when it found no fallbackless var() to resolve', () => {
    const build = {
      ...GOOD,
      [SHEET]: chunk(APP.replace(/var\(/g, 'VAR(')),
      [CALENDAR_CHUNK]: chunk(CALENDAR.replace(/var\(/g, 'VAR(')),
    }

    expect(audit(build).failures).toEqual([
      expect.stringContaining('found no fallbackless var() in the injected CSS'),
    ])
  })
})

describe('check 6: every @property rule is one sheet.ts can lift', () => {
  // The parser reads this as a registration and PROPERTY_RULE does not, so the document would
  // never get it and the utility composed through it would compute to nothing.
  it('rejects a registration the runtime pattern cannot match', () => {
    const build = withApp('@property/**/--tw-ring-color{syntax:"*";inherits:false}')

    expect(audit(build).failures).toEqual([
      expect.stringMatching(
        /^dist\/assets\/sheet-BSYtLEmB\.js: 2 @property rule\(s\), but PROPERTY_RULE matches 1 — /,
      ),
    ])
  })

  it('rejects text the runtime pattern would lift that is no registration', () => {
    const css = `${APP}:where(.sy-atlas) .x:before{content:"@property --tw-fake{}"}`

    expect(propertyFailures(parse(css), css)).toEqual({
      registrations: 1,
      failures: [expect.stringContaining('1 @property rule(s), but PROPERTY_RULE matches 2')],
    })
  })

  // `@property` is document-global and cannot be namespaced, so only Tailwind's own prefix is
  // let through.
  it('rejects a registration outside Tailwind’s prefix', () => {
    const build = withApp('@property --brand-accent{syntax:"<color>";inherits:false}')

    expect(audit(build).failures).toEqual([
      expect.stringMatching(
        /^dist\/assets\/sheet-BSYtLEmB\.js: @property --brand-accent registers a document-global name/,
      ),
    ])
  })

  it('fails when it found no registration at all', () => {
    const build = {
      ...GOOD,
      [SHEET]: chunk(APP.replace(/@property [^}]*\}/, ':where(.sy-atlas){--tw-shadow:0 0 #0000}')),
    }

    expect(audit(build).failures).toEqual([
      expect.stringContaining('found no @property in the injected CSS'),
    ])
  })
})

describe('@font-face families', () => {
  it('rejects a family a host page may already define', () => {
    const build = withApp('@font-face{font-family:Roboto;src:url(/assets/roboto.woff2)}')

    expect(audit(build).failures).toEqual([
      expect.stringMatching(/^dist\/assets\/sheet-BSYtLEmB\.js: @font-face declares "Roboto" — /),
    ])
  })

  it('rejects a face that names no family', () => {
    expect(fontFaceFailures(parse('@font-face{src:url(/assets/x.woff2)}'))).toEqual([
      expect.stringContaining('@font-face declares "undefined"'),
    ])
  })

  it('accepts our own namespaced family, quoted or not', () => {
    const css =
      '@font-face{font-family:"Atlas Rethink Sans";src:url(/assets/rethink.woff2)}' +
      "@font-face{font-family:'Atlas Rethink Sans';src:url(/assets/rethink-bold.woff2)}"

    expect(fontFaceFailures(parse(css))).toEqual([])
    expect(audit(withApp(css)).failures).toEqual([])
  })
})

describe('what the gate can read', () => {
  // Nothing hands a separate .css asset to the sheet the shadow root adopts.
  it('rejects a stylesheet emitted as a file of its own', () => {
    expect(audit({ ...GOOD, 'dist/assets/main-AAAAAAAA.css': APP }).failures).toEqual([
      'dist/assets/main-AAAAAAAA.css: CSS emitted as a separate asset, outside what this gate reads',
    ])
  })

  it('fails when it found no injected stylesheet', () => {
    const { failures } = audit({ [EMBED]: GOOD[EMBED], [SHEET]: 'var e=1;export{e as t};' })

    expect(failures[0]).toContain('found no injected CSS in dist/')
  })

  // The template literal is a minifier's choice. Quoted any other way the sheet is skipped, and
  // only the site count says so while another chunk still matches.
  it('fails when a chunk injects a sheet it cannot extract', () => {
    const quoted = `${SINK}(${JSON.stringify(APP)},{})})();`
    const { failures } = audit({ ...GOOD, 'dist/assets/lightbox-C3AfJsM3.js': quoted })

    expect(failures).toEqual([
      expect.stringContaining('found 2 stylesheet(s) but 3 injection site(s)'),
    ])
  })

  it('counts one site per sink, not per mention of the sink key', () => {
    const reader = 'var n=globalThis.__syAtlasCss||={chunks:[],listeners:[]};'

    expect(countInjectionSites(reader)).toBe(0)
    expect(countInjectionSites(reader + inject(APP) + inject(CALENDAR))).toBe(2)
  })
})

describe('extractInjectedCss', () => {
  it('reads every sheet a chunk injects', () => {
    expect(extractInjectedCss(`${inject(APP)}\n${inject(CALENDAR)}`)).toEqual([APP, CALENDAR])
  })

  it('undoes the escaping a template literal needs', () => {
    const css = '.a\\:b{content:"`"}.c{content:"${x}"}'
    const source = inject(css)

    // The fixture is only worth this if the escapes are really in the chunk.
    expect(source).toContain('.a\\\\:b{content:"\\`"}.c{content:"\\${x}"}')
    expect(extractInjectedCss(source)).toEqual([css])
  })

  it('finds nothing in a chunk with no sink, or with one it cannot read', () => {
    expect(extractInjectedCss(GOOD[EMBED])).toEqual([])
    expect(extractInjectedCss(`${SINK}(${JSON.stringify(APP)},{})})();`)).toEqual([])
  })
})
