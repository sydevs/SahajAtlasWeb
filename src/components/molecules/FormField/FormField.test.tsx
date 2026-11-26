import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import {
  type FieldControlProps,
  FormField,
  fieldDescribedBy,
  fieldErrorId,
  fieldHelpId,
  fieldLabelId,
} from './FormField'

// Node-only SSR assertions (see `docs/testing.md`). This pins the pair of
// contracts every form atom in the app leans on: the describedby ids, and,
// since issue #102, whether a field error announces itself.

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
    // This is ReportIssueForm's case. It validates on every keystroke, and
    // gates its submit on validity. So an assertive region would interrupt
    // typing to report a half-typed field, and there is no failed submit
    // for it to announce.
    const html = renderToStaticMarkup(
      <FormField announceError={false} error="Enter a valid email" htmlFor="email" label="Email">
        <input id="email" />
      </FormField>,
    )

    expect(html).not.toContain('role="alert"')
    expect(html).toContain('Enter a valid email')
  })

  it('keeps the error addressable as an aria-describedby target either way', () => {
    // The id is what connects the sentence to the control. It is a separate
    // job from announcing. So opting out of the alert must not cost it.
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

    // Nothing to announce means nothing mounted. That absence is what stops
    // a live region from firing on every re-render of a valid form.
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

describe('the control wiring a field hands its control', () => {
  it('passes the id, the describedby ids, the required flag and the error state', () => {
    const html = renderToStaticMarkup(
      <FormField required error="Enter a date" help="Any day" htmlFor="date" label="Date">
        {({ isInvalid, ...control }) => <input aria-invalid={isInvalid} {...control} />}
      </FormField>,
    )

    expect(html).toContain('id="date"')
    // The error replaces the help, so only the error is pointed at.
    expect(html).toContain('aria-describedby="date-error"')
    expect(html).toContain('aria-required="true"')
    expect(html).toContain('aria-invalid="true"')
  })

  it('points at the help while there is no error, and says the field is valid', () => {
    let wired: FieldControlProps | undefined

    renderToStaticMarkup(
      <FormField help="Any day" htmlFor="date" label="Date">
        {(control) => {
          wired = control

          return <input id="date" />
        }}
      </FormField>,
    )

    expect(wired).toEqual({
      id: 'date',
      'aria-labelledby': undefined,
      'aria-describedby': 'date-help',
      'aria-required': undefined,
      isInvalid: false,
    })
  })
})

describe('a field for a group of controls', () => {
  it('is a fieldset named by its legend, which its control points back at', () => {
    let wired: FieldControlProps | undefined
    const html = renderToStaticMarkup(
      <FormField required as="fieldset" error="Choose a day" label="On which day?" name="day">
        {(control) => {
          wired = control

          return <div role="radiogroup" />
        }}
      </FormField>,
    )

    expect(html).toMatch(/^<fieldset/)
    expect(html).toContain(`<legend class="mb-1 text-sm font-medium" id="${fieldLabelId('day')}">`)
    expect(html).not.toContain('<label')
    // The error is keyed by the group's name, as a control's is by its id.
    expect(html).toContain(`id="${fieldErrorId('day')}"`)
    expect(wired).toMatchObject({
      id: undefined,
      'aria-labelledby': 'day-label',
      'aria-describedby': 'day-error',
      isInvalid: true,
    })
  })
})

describe('a field around a control that labels itself', () => {
  it('keys its help and error by `name`, and hands the control no id', () => {
    let wired: FieldControlProps | undefined

    const html = renderToStaticMarkup(
      <FormField error="Tick to continue" label="Consent" name="consent">
        {(control) => {
          wired = control

          return <button type="button" />
        }}
      </FormField>,
    )

    expect(html).toContain(`id="${fieldErrorId('consent')}"`)
    expect(wired).toMatchObject({ id: undefined, 'aria-describedby': 'consent-error' })
  })
})
