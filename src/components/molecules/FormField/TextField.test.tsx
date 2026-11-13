import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { TextField } from '.'

// Node-only SSR assertions (see `docs/testing.md`): the one text field every form shares. i18next
// echoes the key, for the optional note.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('TextField', () => {
  // The registration form left its required fields unmarked while the add-a-class form starred
  // them; one field marks them one way.
  it('marks a required field on its label and its control', () => {
    const html = renderToStaticMarkup(<TextField required id="email" label="Email" />)

    expect(html).toContain('Email *</label>')
    expect(html).toMatch(/<input[^>]*aria-required="true"/)
  })

  it('leaves an unrequired field unmarked, and notes an optional one', () => {
    expect(renderToStaticMarkup(<TextField id="name" label="Name" />)).not.toContain('*')
    expect(renderToStaticMarkup(<TextField optional id="note" label="Note" />)).toContain(
      'common.chrome.optional',
    )
  })

  it('wires its label, help and error to the control', () => {
    const html = renderToStaticMarkup(
      <TextField error="Enter a valid email" help="We reply here" id="email" label="Email" />,
    )

    expect(html).toContain('for="email"')
    expect(html).toMatch(/<input[^>]*id="email"[^>]*aria-describedby="email-error"/)
    expect(html).toMatch(/<input[^>]*aria-invalid="true"/)
  })

  it('is a textarea when multiline, keeping its own attributes off the element', () => {
    const html = renderToStaticMarkup(
      <TextField multiline id="question" label="Anything else?" rows={2} />,
    )

    expect(html).toMatch(/<textarea[^>]*id="question"[^>]*rows="2"/)
    expect(html).not.toContain('<input')
    expect(html).not.toContain('multiline')
  })
})
