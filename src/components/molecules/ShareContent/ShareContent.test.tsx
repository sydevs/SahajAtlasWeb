import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ShareContent } from './ShareContent'

// Node-only SSR assertions (see `.claude/rules/tests.md`). Mock the i18n boundary
// so the embedded CopyField's `t()` resolves without booting i18next.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// A URL/title carrying `&` and `?` must be FULLY percent-encoded where it lands as
// a sharer query-param value, so no character can spill into a new param on the
// third-party URL — encodeURIComponent, not encodeURI (which leaves `& ? / #` raw).
const url = 'https://sahaj.test/e?a=1&b=2'
const label = 'Yoga & Meditation?'
const encodedUrl = 'https%3A%2F%2Fsahaj.test%2Fe%3Fa%3D1%26b%3D2'
const encodedLabel = 'Yoga%20%26%20Meditation%3F'

describe('ShareContent', () => {
  it('percent-encodes the URL as a query value for every sharer link', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    // `&` → %26 and `?` → %3F inside the value, so nothing appends a stray param.
    expect(html).toContain(`sharer.php?u=${encodedUrl}`)
    expect(html).toContain(`intent/tweet?text=${encodedUrl}`)
    expect(html).toContain(`share-offsite/?url=${encodedUrl}`)
    expect(html).toContain('%26')
    expect(html).toContain('%3F')
  })

  it('percent-encodes the title where it is a query value', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    expect(html).toContain(`subject=${encodedLabel}`)
    expect(html).toContain(`title=${encodedLabel}`)
  })

  it('leaves no un-encoded scheme/separator that could append a stray param', () => {
    const html = renderToStaticMarkup(<ShareContent label={label} url={url} />)

    // encodeURI would leave these raw in the sharer href; encodeURIComponent doesn't.
    expect(html).not.toContain('?u=https://')
    expect(html).not.toContain('text=https://')
  })
})
