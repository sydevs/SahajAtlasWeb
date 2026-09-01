import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { Spinner } from '.'

// Node-only SSR assertions (see `docs/testing.md`). The subject is the atom's
// screen-reader name, which used to be the string "Loading" hard-coded in the markup —
// the app's one untranslated SR string (issue #102).

describe('Spinner screen-reader text', () => {
  it('falls back to English rather than a raw key when the caller has no translation', () => {
    // The default has to be a real word, not `t('loading')`: a Suspense fallback can run
    // before the translation bundles have loaded, and English is the app's fallbackLng.
    const html = renderToStaticMarkup(<Spinner />)

    expect(html).toContain('<span class="sr-only">Loading</span>')
  })

  it('uses the caller-supplied name when there is one', () => {
    const html = renderToStaticMarkup(<Spinner srLabel="Chargement…" />)

    expect(html).toContain('Chargement…')
    expect(html).not.toContain('>Loading<')
  })

  it('says nothing at all when decorative', () => {
    // Inside a control that already announces its own busy state (Button carries
    // aria-busy), a second "Loading" would be layered over the control's label.
    const html = renderToStaticMarkup(<Spinner decorative />)

    expect(html).not.toContain('sr-only')
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('aria-live')
  })

  it('drops the sr-only copy when a visible label already carries it', () => {
    const html = renderToStaticMarkup(<Spinner label="Loading…" />)

    expect(html).not.toContain('sr-only')
    expect(html).toContain('Loading…')
  })

  it('keeps the live region for the non-decorative case', () => {
    const html = renderToStaticMarkup(<Spinner />)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
  })
})
