import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { BootFallback } from './Fallbacks'

// Node-only SSR (see `docs/testing.md`): i18next echoes the key, and the viewport reads narrow,
// as a phone's does, so the panel is the bottom sheet.
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/config/responsive', async (load) => ({
  ...(await load<typeof import('@/config/responsive')>()),
  useIsWide: () => false,
}))

const boot = (route: string, listFirst = false) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <BootFallback listFirst={listFirst} />
    </MemoryRouter>,
  )

// The boot panel stands where the sheet opens and in the shape of what the address opens
// (Devindra, 12 Nov: the panel slid in several times, and the placeholder looked like nothing).
describe('BootFallback', () => {
  it('stands at the first screen’s height, in its shape: title, field with its location line, flagged rows', () => {
    const html = boot('/')

    expect(html).toContain('height:380px')
    expect(html).toContain('bg-secondary-3')
    expect(html).toContain('rounded-full')
    expect(html).not.toContain('min-h-8')
  })

  it('draws a place with its Back row and a plain list', () => {
    const html = boot('/gb/south-east')

    expect(html).toContain('height:380px')
    expect(html).toContain('min-h-8')
    expect(html).not.toContain('bg-secondary-3')
  })

  it('stands a class at its own height plus the home-indicator inset, with no Register of its own', () => {
    const html = boot('/gb/south-east/london/1207')

    expect(html).toContain('env(safe-area-inset-bottom')
    expect(html).not.toContain('h-11')
  })

  // The real sheet opens at `openStop`'s stop, and the panel stood at 380px for all of them, so
  // these jumped in one frame when the drawer took over in place (464 → 404, and 464 → 25).
  it("stands a searched place at the search stop, as the sheet opens there", () => {
    expect(boot('/search?q=Brighton&center=-0.14,50.82')).toContain('height:440px')
  })

  it('stands an online-only list near full: a place’s Online classes, or results filtered to online', () => {
    for (const route of ['/online', '/gb/online', '/search?format=online']) {
      expect(boot(route)).toContain('height:calc(var(--sy-frame-h, 100dvh) * 0.97)')
    }
  })

  it('stands a form near full, and a search with no place at the usual open stop', () => {
    expect(boot('/gb/south-east/london/1207/register')).toContain('* 0.97)')
    expect(boot('/search?q=Brighton')).toContain('height:356px')
  })

  it('takes the list-first shape: the list in its column, over no map', () => {
    const html = boot('/gb/south-east', true)

    expect(html).toContain('max-w-[var(--sy-content-max,512px)]')
    expect(html).not.toContain('fixed inset-0 bg-gray-3')
    expect(html).not.toContain('height:380px')
  })
})
