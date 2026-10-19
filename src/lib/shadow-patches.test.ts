// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { FocusScope } from '@radix-ui/react-focus-scope'
import { hideOthers } from 'aria-hidden'
import { createElement } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { deepActiveElement } from './active-element'

const require_ = createRequire(import.meta.url)

const FOCUS_SCOPE = '@radix-ui/react-focus-scope'

const PATCH_HUNKS: [string, string][] = [
  ['focusin reads the composed path', 'const target = getEventTarget(event);'],
  ['focusout exempts the shadow host', 'if (relatedTarget === getShadowHost(container)) return;'],
  ['activeElement resolves through the boundary', 'function getActiveElement()'],
]

function expectPatched(dist: string, label: string) {
  for (const file of ['index.js', 'index.mjs']) {
    const src = readFileSync(join(dist, file), 'utf8')

    for (const [what, hunk] of PATCH_HUNKS) {
      expect(src, `${label} ${file}: ${what}`).toContain(hunk)
    }
  }
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
  it('keeps both hunks in the installed bundles', () => {
    expectPatched(dirname(require_.resolve(FOCUS_SCOPE)), 'direct')
  })

  /**
   * ⚠ The assertion above answers for OUR copy, which is pinned and so always passes. The
   * copy that matters is the one each Radix primitive resolves, and they are not the same
   * question: every `@radix-ui/react-*` package declares its own caret range on
   * focus-scope, so bumping one resolves a SECOND, unpatched copy beneath it while ours
   * stays in the tree as a direct devDependency. The patch then applies to a module
   * nothing renders. Nothing fails — the patch is still "installed" — and every defect
   * this file documents comes back.
   *
   * Measured, not feared: `pnpm update` on dialog, popover and select put all three on an
   * unpatched 1.3.1 while the assertion above stayed green.
   *
   * So resolve from each primitive's own entry, and require ONE copy. The consumer list
   * comes from `package.json` rather than this file, because a list written here would go
   * stale the day a primitive is added — which is the shape of the hole being closed.
   */
  it('resolves ONE patched copy from every Radix primitive, not just from our own pin', () => {
    const { dependencies } = require_('../../package.json') as {
      dependencies: Record<string, string>
    }
    const primitives = Object.keys(dependencies).filter((name) =>
      name.startsWith('@radix-ui/react-'),
    )

    expect(primitives.length, 'no Radix primitive found to resolve from').toBeGreaterThan(0)

    const copies = new Set<string>()

    for (const name of primitives) {
      const dist = dirname(createRequire(require_.resolve(name)).resolve(FOCUS_SCOPE))

      copies.add(dist)
      expectPatched(dist, name)
    }

    expect([...copies], 'a primitive renders an unpatched FocusScope').toHaveLength(1)
  })
})
