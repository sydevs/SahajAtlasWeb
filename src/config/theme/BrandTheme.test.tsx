// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it } from 'vitest'

import { BrandTheme } from './BrandTheme'

import { getThemeRoot } from '@/hooks/use-theme'
import { overlayContainer } from '@/lib/overlay'

/**
 * The widget wrapper becomes the theme root on the FIRST commit.
 *
 * jsdom, because the defect was one of commit timing: `Widget.tsx` handed this component a ref
 * to its own parent, and React attaches a parent's ref only after its children's layout effects
 * run. The effect adopted `<html>`, and re-ran only if the client's colours changed afterwards —
 * never, in path mode or for a record with no colours. So every portal in the app landed on the
 * host's `<body>`, outside the scoped stylesheet, and the compact card's dialog opened as a bare
 * map.
 *
 * The host below is `Widget.tsx`'s shape: the node held in state, and the children waiting for
 * it. No palette and no key, so nothing can re-run the effect and rescue a late adoption.
 */

let cleanup: (() => void) | null = null

afterEach(() => {
  cleanup?.()
  cleanup = null
  document.body.innerHTML = ''
})

function WidgetShapedHost() {
  const [root, adopt] = useState<HTMLDivElement | null>(null)

  return (
    <div ref={adopt} data-testid="wrapper">
      {root && (
        <BrandTheme root={root}>
          <span />
        </BrandTheme>
      )}
    </div>
  )
}

describe('BrandTheme', () => {
  it('adopts the widget wrapper on mount, with no palette to re-run it', () => {
    const host = document.createElement('div')

    document.body.append(host)

    const reactRoot = createRoot(host)
    const queryClient = new QueryClient()

    act(() =>
      reactRoot.render(
        <QueryClientProvider client={queryClient}>
          <WidgetShapedHost />
        </QueryClientProvider>,
      ),
    )
    cleanup = () => act(() => reactRoot.unmount())

    const wrapper = host.querySelector('[data-testid="wrapper"]')

    expect(getThemeRoot()).toBe(wrapper)
    expect(overlayContainer()).toBe(wrapper)
  })

  it('releases the root on unmount', () => {
    const host = document.createElement('div')

    document.body.append(host)

    const reactRoot = createRoot(host)

    act(() =>
      reactRoot.render(
        <QueryClientProvider client={new QueryClient()}>
          <WidgetShapedHost />
        </QueryClientProvider>,
      ),
    )
    act(() => reactRoot.unmount())

    expect(getThemeRoot()).toBe(document.documentElement)
  })
})
