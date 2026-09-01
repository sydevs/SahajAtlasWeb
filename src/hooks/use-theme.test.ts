import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyTheme, initTheme, getInitialTheme, setThemeRoot } from './use-theme'

// The unit lane is node-only (no jsdom — see CLAUDE.md § Testing), so we stub
// the minimal classList surface and `localStorage` that the theme helpers touch,
// then assert their DOM-light contracts directly.
function fakeElement() {
  const classes = new Set<string>()

  return {
    classes,
    el: {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (...cs: string[]) => cs.forEach((c) => classes.delete(c)),
        contains: (c: string) => classes.has(c),
      },
    } as unknown as HTMLElement,
  }
}

function stubDocument() {
  const { classes, el } = fakeElement()

  vi.stubGlobal('document', { documentElement: el })

  return classes
}

afterEach(() => {
  setThemeRoot(null) // reset the root override so tests don't leak into each other
  vi.unstubAllGlobals()
})

describe('applyTheme', () => {
  it('adds the requested theme class and clears the other', () => {
    const classes = stubDocument()

    applyTheme('dark')
    expect(classes.has('dark')).toBe(true)
    expect(classes.has('light')).toBe(false)

    applyTheme('light')
    expect(classes.has('light')).toBe(true)
    expect(classes.has('dark')).toBe(false)
  })
})

describe('setThemeRoot', () => {
  it('directs applyTheme at the configured root instead of <html>', () => {
    const html = stubDocument()
    const { classes: widget, el } = fakeElement()

    setThemeRoot(el)
    applyTheme('dark')

    expect(widget.has('dark')).toBe(true)
    expect(html.has('dark')).toBe(false) // host page <html> untouched
  })

  it('reverts to <html> when cleared with null', () => {
    const html = stubDocument()
    const { el } = fakeElement()

    setThemeRoot(el)
    setThemeRoot(null)
    applyTheme('dark')

    expect(html.has('dark')).toBe(true)
  })
})

describe('initTheme', () => {
  it('is a no-op outside the browser (no document)', () => {
    expect(() => initTheme()).not.toThrow()
  })

  it('restores the persisted theme', () => {
    const classes = stubDocument()

    vi.stubGlobal('localStorage', { getItem: () => 'dark', setItem: () => {} })

    initTheme()
    expect(classes.has('dark')).toBe(true)
  })

  it('falls back to the default theme when nothing is stored', () => {
    const classes = stubDocument()

    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })

    initTheme('dark')
    expect(classes.has('dark')).toBe(true)
  })

  it('falls back to the default when localStorage throws (sandboxed iframe)', () => {
    const classes = stubDocument()

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })

    expect(() => initTheme()).not.toThrow()
    expect(classes.has('light')).toBe(true)
  })
})

describe('getInitialTheme', () => {
  it('returns the persisted theme', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'dark', setItem: () => {} })
    expect(getInitialTheme()).toBe('dark')
  })

  it('falls back to the default when nothing is stored', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
    expect(getInitialTheme('dark')).toBe('dark')
  })

  it('ignores a garbage stored value', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'chartreuse', setItem: () => {} })
    expect(getInitialTheme()).toBe('light')
  })
})
