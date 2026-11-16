import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { CountryFlag } from './CountryFlag'

describe('CountryFlag', () => {
  it('serves the flag from the widget’s own files, with no referrer', () => {
    const html = renderToStaticMarkup(<CountryFlag countryCode="IS" />)

    expect(html).toContain('/flags/is.svg')
    expect(html).not.toContain('pages.dev')
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).toContain('alt=""')
  })

  it('renders nothing for a code that is not two letters', () => {
    expect(renderToStaticMarkup(<CountryFlag countryCode="../x" />)).toBe('')
  })
})
