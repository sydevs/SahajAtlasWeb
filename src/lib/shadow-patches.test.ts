// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { FocusScope } from '@radix-ui/react-focus-scope'
import { hideOthers } from 'aria-hidden'
import { createElement } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { deepActiveElement } from './active-element'

type Resolver = ReturnType<typeof createRequire>

type Patch = {
  /** Every built file the patch rewrites, relative to the package root. */
  files: string[]
  /** `[what the hunk does, a string only a PATCHED build contains]`. */
  hunks: [string, string][]
  /** `[what the hunk replaced, a string only an UNPATCHED build contains]`. */
  gone: [string, string][]
}

const require_ = createRequire(import.meta.url)

const FOCUS_SCOPE = '@radix-ui/react-focus-scope'

const ARIA_HIDDEN = 'aria-hidden'

const PATCHES: Record<string, Patch> = {
  [FOCUS_SCOPE]: {
    files: ['dist/index.js', 'dist/index.mjs'],
    hunks: [
      ['focusin reads the composed path', 'const target = getEventTarget(event);'],
      [
        'focusout exempts the shadow host',
        'if (relatedTarget === getShadowHost(container)) return;',
      ],
      ['activeElement resolves through the boundary', 'function getActiveElement()'],
    ],
    gone: [],
  },
  [ARIA_HIDDEN]: {
    files: ['dist/es2015/index.js', 'dist/es2019/index.js', 'dist/es5/index.js'],
    hunks: [
      ['the sweep climbs out of a shadow root', 'keep(el.parentNode || el.host);'],
      [
        'the sweep descends into a kept root',
        'if (node.shadowRoot && elementsToKeep.has(node.shadowRoot)) deep(node.shadowRoot);',
      ],
      ["issue-10's exemption is collected from the target's own root", 'sydevsTargetRoot'],
    ],
    gone: [['correctTargets keeps the target, not its host', 'return correctedTarget;']],
  },
}

function readManifest(root: string) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    name?: string
    dependencies?: Record<string, string>
  }
}

/**
 * Where `name` is installed, as seen from `from`.
 *
 * An `exports` map without a `./package.json` entry is the common case here, so the fallback
 * resolves the package's own entry point and climbs to the manifest that claims the name.
 */
function packageRoot(from: Resolver, name: string) {
  let dir

  try {
    dir = dirname(from.resolve(`${name}/package.json`))
  } catch {
    dir = dirname(from.resolve(name))
  }

  for (;;) {
    if (existsSync(join(dir, 'package.json')) && readManifest(dir).name === name) return dir

    const up = dirname(dir)

    if (up === dir) throw new Error(`no installed package.json claims ${name}`)

    dir = up
  }
}

function expectPatched(module: string, root: string, label: string) {
  const { files, hunks, gone } = PATCHES[module]

  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8')

    for (const [what, hunk] of hunks) expect(src, `${label} ${file}: ${what}`).toContain(hunk)

    for (const [what, hunk] of gone) expect(src, `${label} ${file}: ${what}`).not.toContain(hunk)
  }
}

/**
 * Every package in our runtime graph that declares `module` itself, mapped to the resolver that
 * sees what IT resolves.
 *
 * ⚠ A specifier whose own entry cannot be resolved is skipped, so it contributes no consumers of
 * its own. One does today — `vite-plugin-css-injected-by-js`, which declares neither patch.
 */
function consumersOf(module: string) {
  const { dependencies } = require_('../../package.json') as {
    dependencies: Record<string, string>
  }
  const consumers = new Map<string, Resolver>()
  const visited = new Set<string>()
  const queue: [string, Resolver][] = Object.keys(dependencies).map((name) => [name, require_])

  while (queue.length) {
    const [name, from] = queue.shift() as [string, Resolver]
    let root

    try {
      root = packageRoot(from, name)
    } catch {
      continue
    }

    if (visited.has(root)) continue

    visited.add(root)

    const deps = readManifest(root).dependencies ?? {}
    const own = createRequire(join(root, 'package.json'))

    if (module in deps) consumers.set(name, own)

    for (const dep of Object.keys(deps)) if (dep !== module) queue.push([dep, own])
  }

  return consumers
}

/**
 * The two dependency patches the shadow boundary forces (#236).
 *
 * Both libraries read the DOM in ways a shadow root defeats, and both fail SILENTLY: no
 * throw, no log, just a focus trap that does not trap and a screen reader that still
 * reaches everything behind a modal. `patches/` carries the fixes, so what is asserted
 * here is the installed library's behaviour through a real boundary — the only place the
 * defect is observable.
 *
 * jsdom, because a shadow root and its retargeting ARE the subject.
 */

function mountShadowHost() {
  const host = document.createElement('sahaj-atlas')

  document.body.append(host)

  return host.attachShadow({ mode: 'open' })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('aria-hidden through a shadow boundary', () => {
  it('hides a sibling INSIDE the root, which is what the unpatched library cannot reach', () => {
    const root = mountShadowHost()

    root.innerHTML = `
      <div id="wrapper">
        <div id="modal">dialog</div>
        <div id="sibling">behind the dialog</div>
        <span id="live" aria-live="polite">status</span>
      </div>
    `
    const outside = document.createElement('div')

    outside.id = 'host-sibling'
    document.body.append(outside)

    const modal = root.getElementById('modal') as HTMLElement
    const undo = hideOthers(modal)

    // The host page is hidden either way — correctTargets reaches the host unpatched too.
    expect(outside.getAttribute('aria-hidden')).toBe('true')

    // The patch: the sweep descends into the kept root instead of stopping at the host.
    expect(root.getElementById('sibling')?.getAttribute('aria-hidden')).toBe('true')
    expect(modal.getAttribute('aria-hidden')).toBeNull()

    // Descending puts our own live regions in reach, so the library's issue-10 exemption
    // has to be collected from the target's root as well as from the document.
    expect(root.getElementById('live')?.getAttribute('aria-hidden')).toBeNull()

    undo()
    expect(outside.getAttribute('aria-hidden')).toBeNull()
    expect(root.getElementById('sibling')?.getAttribute('aria-hidden')).toBeNull()
  })

  it('leaves the widget itself reachable — the host element is never hidden', () => {
    const root = mountShadowHost()

    root.innerHTML = '<div id="modal">dialog</div>'
    const host = (root as ShadowRoot).host

    const undo = hideOthers(root.getElementById('modal') as HTMLElement)

    expect(host.getAttribute('aria-hidden')).toBeNull()
    undo()
  })

  /**
   * Both specs above import `hideOthers` at top level, so they exercise OUR pinned copy. This
   * asserts the patch is in it; the consumer pin below is what asks about the copy a Radix
   * primitive renders.
   */
  it('keeps every hunk in our own pinned copy', () => {
    expectPatched(ARIA_HIDDEN, packageRoot(require_, ARIA_HIDDEN), 'our pin')
  })
})

describe('FocusScope through a shadow boundary', () => {
  it('pulls focus back into a trapped scope when it lands on the host page', async () => {
    const root = mountShadowHost()
    const container = document.createElement('div')

    root.append(container)

    const outside = document.createElement('button')

    outside.textContent = 'host page'
    document.body.append(outside)

    const reactRoot = createRoot(container)

    await act(async () => {
      reactRoot.render(
        createElement(
          FocusScope,
          { trapped: true, loop: true },
          createElement('button', { id: 'inside-a' }, 'a'),
          createElement('button', { id: 'inside-b' }, 'b'),
        ),
      )
    })

    const insideA = root.getElementById('inside-a') as HTMLButtonElement

    await act(async () => {
      insideA.focus()
    })
    expect(deepActiveElement()).toBe(insideA)

    // Unpatched, `event.target` on the document listener is <sahaj-atlas>, so the scope
    // never records a focused element and never pulls focus back: the trap is inert.
    await act(async () => {
      outside.focus()
    })
    expect(deepActiveElement()).toBe(insideA)

    await act(async () => {
      reactRoot.unmount()
    })
  })

  /**
   * ⚠ The `focusout` half of the patch has no behavioural spec, and cannot have one here.
   * Its symptom needs the browser's real ordering — `focusout` on the leaving control,
   * carrying a RETARGETED `relatedTarget`, dispatched before the `focusin` on the
   * arriving one. jsdom fires no `focusout` with a retargeted `relatedTarget`, so every
   * sequence that can be driven here leaves the scope's last-focused element equal to the
   * focused one, which the unpatched code also satisfies. A vacuous pass is worse than
   * none, so what stands in for it is drift detection plus the attended browser pass that
   * `docs/embedding.md` already owes.
   */
  it('keeps every hunk in our own pinned copy', () => {
    expectPatched(FOCUS_SCOPE, packageRoot(require_, FOCUS_SCOPE), 'our pin')
  })
})

/**
 * ⚠ The two pins above answer for the copy OUR patch is keyed to, so neither can report drift.
 * The copy that matters is the one each consumer resolves, and the two are different questions.
 *
 * Radix pins its own primitives EXACTLY — dialog, menu, popover and select each declare
 * `"@radix-ui/react-focus-scope": "1.1.16"`. So a newer dialog pins a newer exact focus-scope,
 * a SECOND copy arrives unpatched, and ours stays in the tree as a direct devDependency. The
 * patch then applies to a module nothing renders. Nothing fails, and every defect this file
 * documents comes back. The same four declare `aria-hidden: ^1.2.4`, a caret, so there one
 * published release opens the hole with no Radix bump — latent only while 1.2.6 is newest.
 *
 * Measured, not feared: `pnpm update` on dialog, popover, select and dropdown-menu put all
 * four consumers — `react-menu` included — on an unpatched focus-scope 1.3.1, while our own
 * pin stayed 1.1.16 and patched and the pins above stayed green.
 *
 * ⚠ The consumer set is the runtime dependency closure, not `dependencies` filtered by name.
 * Only 3 of our 9 direct `@radix-ui/react-*` packages declare focus-scope; the other 6 resolve
 * it by falling back to the hoisted copy, which is the vacuous question above wearing a new
 * label. And the fourth real consumer, `@radix-ui/react-menu`, is transitive under
 * `react-dropdown-menu`, so a name filter never asks it. Deriving the set also means a newly
 * added primitive is covered the day it lands.
 */
describe('the patched copy each consumer resolves', () => {
  it.each([FOCUS_SCOPE, ARIA_HIDDEN])(
    'resolves ONE patched %s from every package that declares it',
    (module) => {
      const consumers = consumersOf(module)

      expect(
        consumers.size,
        `nothing declares ${module}, so this pin asks nothing`,
      ).toBeGreaterThan(0)

      const copies = new Set<string>()

      for (const [name, from] of consumers) {
        const root = packageRoot(from, module)

        copies.add(root)
        expectPatched(module, root, name)
      }

      expect([...copies], `more than one ${module} copy resolved`).toHaveLength(1)
    },
  )
})
