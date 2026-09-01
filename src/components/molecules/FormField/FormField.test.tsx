import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import { FormField, fieldDescribedBy, fieldErrorId, fieldHelpId } from '.'

// Node-only SSR assertions (see `docs/testing.md`). What is pinned here is the
// pair of contracts every form atom in the app leans on: the describedby ids, and —
// since issue #102 — whether a field error announces itself.

describe('FormField error semantics', () => {
  it('announces the error by default, because a failed submit is otherwise silent', () => {
    const html = renderToStaticMarkup(
      <FormField error="Enter your name" htmlFor="name" label="Name">
        <input id="name" />
      </FormField>,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Enter your name')
  })

  it('drops the live semantics when the caller opts out', () => {
    // ReportIssueForm's case: it validates on every keystroke and gates its submit on
    // validity, so an assertive region would interrupt typing to report a half-typed
    // field, and there is no failed submit for it to announce.
    const html = renderToStaticMarkup(
      <FormField announceError={false} error="Enter a valid email" htmlFor="email" label="Email">
        <input id="email" />
      </FormField>,
    )

    expect(html).not.toContain('role="alert"')
    expect(html).toContain('Enter a valid email')
  })

  it('keeps the error addressable as an aria-describedby target either way', () => {
    // The id is what connects the sentence to the control. It is a separate job from
    // announcing, so opting out of the alert must not cost it.
    for (const announceError of [true, false]) {
      const html = renderToStaticMarkup(
        <FormField announceError={announceError} error="Required" htmlFor="name" label="Name">
          <input id="name" />
        </FormField>,
      )

      expect(html).toContain(`id="${fieldErrorId('name')}"`)
    }
  })

  it('renders no error node at all when there is no error', () => {
    const html = renderToStaticMarkup(
      <FormField help="Optional" htmlFor="email" label="Email">
        <input id="email" />
      </FormField>,
    )

    // Nothing to announce means nothing mounted — that absence is what stops a live
    // region from firing on every re-render of a valid form.
    expect(html).not.toContain('role="alert"')
    expect(html).toContain(`id="${fieldHelpId('email')}"`)
  })

  it('replaces the help text with the error rather than stacking them', () => {
    const html = renderToStaticMarkup(
      <FormField error="Required" help="Optional" htmlFor="email" label="Email">
        <input id="email" />
      </FormField>,
    )

    expect(html).toContain('Required')
    expect(html).not.toContain('Optional')
  })
})

describe('the describedby id convention', () => {
  it('joins help and error into one attribute value', () => {
    expect(fieldDescribedBy({ name: 'email', help: true, error: true })).toBe(
      'email-help email-error',
    )
  })

  it('collapses to undefined when there is nothing to point at', () => {
    expect(fieldDescribedBy({ name: 'email' })).toBeUndefined()
    expect(fieldErrorId(undefined)).toBeUndefined()
  })
})
