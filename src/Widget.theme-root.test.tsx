// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { StrictMode, act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'

import { BrandTheme } from '@/config/theme/BrandTheme'
import { usePublishedNode } from '@/hooks/use-published-node'
import { getThemeRoot, setThemeRoot } from '@/hooks/use-theme'
import { overlayContainer } from '@/lib/overlay'

/**
 * The widget wrapper is the theme root, and so the portal target, from `App`'s first render.
 *
 * jsdom, because this is commit timing. A render body that reads `overlayContainer()` before the
 * wrapper is published gets the host's `<body>`, outside the scoped stylesheet — which is how the
 * compact card's dialog opened unstyled (#235). The host below is `Widget.tsx`'s shape, with
 * `App`'s `StrictMode` around `BrandTheme`, and no palette or key to re-run anything late.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  setThemeRoot(null)
  document.body.innerHTML = ''
})

/** Records what `overlayContainer()` answered on every render it performed. */
function Probe({ seen }: { seen: (HTMLElement | undefined)[] }) {
  seen.push(overlayContainer())

  return null
}

function WidgetShapedHost({ children }: { children: ReactNode }) {
  const { node, adopt } = usePublishedNode<HTMLDivElement>(setThemeRoot)

  return (
    <div ref={adopt}>
      {node && (
        <StrictMode>
          <QueryClientProvider client={new QueryClient()}>
            <BrandTheme>{children}</BrandTheme>
          </QueryClientProvider>
        </StrictMode>
      )}
    </div>
  )
}

function mount(children: ReactNode) {
  const host = document.createElement('div')

  document.body.append(host)

  const root = createRoot(host)

  act(() => root.render(<WidgetShapedHost>{children}</WidgetShapedHost>))
  cleanup = () => act(() => root.unmount())

  return host.firstElementChild
}

describe('the theme root', () => {
  it('is the wrapper on every render of what App renders', () => {
    const seen: (HTMLElement | undefined)[] = []
    const wrapper = mount(<Probe seen={seen} />)

    expect(seen.length).toBeGreaterThan(0)
    // EVERY render, not just the last: a dialog that saw `<body>` once has already portaled there.
    expect(seen.every((container) => container === wrapper)).toBe(true)
    // After StrictMode's simulated unmount, too — `BrandTheme` must not be the one to release it.
    expect(getThemeRoot()).toBe(wrapper)
  })

  it('is released on unmount', () => {
    mount(null)
    cleanup?.()
    cleanup = null

    expect(getThemeRoot()).toBe(document.documentElement)
  })
})

/**
 * The JOIN, pinned in source, as `MapFrame.test.tsx` pins its own: everything above proves the
 * shape works, and none of it proves `Widget.tsx` still has that shape. Rendering the real
 * element here would boot the router, i18n and the loader's config for one line of wiring.
 */
describe('the wiring', () => {
  const read = (relative: string) =>
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), relative), 'utf8')

  it('is what Widget.tsx does with its wrapper', () => {
    const source = read('Widget.tsx')

    expect(source).toContain('usePublishedNode<HTMLDivElement>(setThemeRoot)')
    expect(source).toContain('ref={adoptThemeRoot}')
    // `App` waits for the node, whatever the formatting.
    expect(source).toMatch(/\{themeRoot\s*&&[\s(]*<App\b/)
  })
})
