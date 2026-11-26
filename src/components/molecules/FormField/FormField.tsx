import { type ReactNode } from 'react'

/**
 * The `aria-describedby` target for a field's error text. The id
 * convention lives here alone, so a field and the control pointing at it
 * cannot drift apart. Pass the same `htmlFor` or control name to both.
 */
export const fieldErrorId = (name?: string) => (name ? `${name}-error` : undefined)

/**
 * The `aria-describedby` target for a field's help text. Help is a hint
 * the control must carry too. "Optional, we can only reply if you fill
 * this in" is exactly the sort of thing a screen-reader user needs, and a
 * sighted one gets for free. So it is addressable on the same convention
 * as the error.
 */
export const fieldHelpId = (name?: string) => (name ? `${name}-help` : undefined)

/**
 * The id of a group's legend, which its control names itself by (`aria-labelledby`). A radio
 * group inside a fieldset is otherwise a nameless group within a named one.
 */
export const fieldLabelId = (name?: string) => (name ? `${name}-label` : undefined)

/**
 * The full `aria-describedby` value for a control: its help text, its
 * error, or both. Callers pass this straight to the control, so the two
 * ids cannot be wired inconsistently.
 */
export const fieldDescribedBy = ({
  name,
  help,
  error,
}: {
  name?: string
  help?: boolean
  error?: boolean
}) =>
  [help ? fieldHelpId(name) : undefined, error ? fieldErrorId(name) : undefined]
    .filter(Boolean)
    .join(' ') || undefined

/**
 * What a field hands its control, so the control is wired to the label, the help and the error
 * by the field itself rather than by each caller: spread it onto any form atom.
 */
export type FieldControlProps = {
  /** The control's id, matching the label's `htmlFor`. Absent for a group. */
  id?: string
  /** A group's legend, which names it. Absent for a single control, which its label names. */
  'aria-labelledby'?: string
  /** The help or the error, whichever shows. */
  'aria-describedby'?: string
  'aria-required'?: true
  isInvalid: boolean
}

export type FormFieldProps = {
  label: ReactNode
  /** Appends the required marker to the label. The caller still marks the control. */
  required?: boolean
  /** Supporting copy under the control. The error replaces it while one is showing. */
  help?: ReactNode
  error?: ReactNode
  /**
   * Whether the error announces itself when it appears (`role="alert"`).
   * This is on by default, because the failure this exists to prevent is
   * silence.
   *
   * Turn it OFF for a form that validates as the viewer types. A live
   * region speaks on mutation. So under `mode: 'onChange'`, the first
   * character of an email address summons an assertive "Enter a valid
   * email address" over whatever the reader was doing, an interruption
   * that reports nothing but a half-typed field. Such a form needs no
   * announcement anyway, if it gates its submit on validity, because it
   * has no failed submit to announce (`ReportIssueForm` is exactly that
   * shape).
   */
  announceError?: boolean
  /** The control's id. Omitted for a composite control (e.g. a radio list) with no single id. */
  htmlFor?: string
  /**
   * A group of controls with no single id — a choice of cards, a row of days — renders as a
   * `fieldset`, its label as the `legend`. `name` then keys the help, error and legend ids.
   */
  as?: 'fieldset'
  name?: string
  /**
   * The control, or a function that receives its wiring ({@link FieldControlProps}) — the id,
   * `aria-labelledby`, `aria-describedby`, `aria-required` and `isInvalid` — so no caller
   * assembles them by hand.
   */
  children: ReactNode | ((control: FieldControlProps) => ReactNode)
}

/**
 * Label, control, and help or error: the shared shell for every form in the app — the
 * registration form, the report-issue form and adding or correcting a class. It exists as a
 * molecule, instead of a copy per form, so the required marker, the help-or-error precedence,
 * and above all the `aria-describedby` id convention are defined once.
 *
 * A single control is labelled by a `<label>`; a group (`as="fieldset"`) by a `<legend>`. Pass
 * the control as a function to receive its wiring:
 *
 * ```tsx
 * <FormField error={error} help={help} htmlFor="email" label="Email">
 *   {(control) => <Input {...control} type="email" />}
 * </FormField>
 * ```
 */
export function FormField({
  label,
  required,
  help,
  error,
  htmlFor,
  as,
  name,
  children,
  announceError = true,
}: FormFieldProps) {
  const group = as === 'fieldset'
  const key = group ? name : htmlFor
  const showHelp = Boolean(help) && !error
  const control: FieldControlProps = {
    id: group ? undefined : htmlFor,
    'aria-labelledby': group ? fieldLabelId(key) : undefined,
    'aria-describedby': fieldDescribedBy({ name: key, help: showHelp, error: Boolean(error) }),
    'aria-required': required || undefined,
    isInvalid: Boolean(error),
  }
  const caption = (
    <>
      {label}
      {required && ' *'}
    </>
  )
  const Root = group ? 'fieldset' : 'div'

  return (
    <Root className="flex min-w-0 flex-col gap-1">
      {group ? (
        // A legend sits outside the fieldset's flex flow, so it spaces itself.
        <legend className="mb-1 text-sm font-medium" id={fieldLabelId(key)}>
          {caption}
        </legend>
      ) : (
        <label className="text-sm font-medium" htmlFor={htmlFor}>
          {caption}
        </label>
      )}
      {typeof children === 'function' ? children(control) : children}
      {showHelp && (
        <span className="text-xs text-gray-11" id={fieldHelpId(key)}>
          {help}
        </span>
      )}
      {/* Two jobs sit here, and they are not the same one (issue #102).

          `id` is the aria-describedby target. So the error announces WITH the
          field, instead of being a red border and a floating sentence a screen
          reader never connects to it. That only ever covers the field a reader
          is standing on.

          `role="alert"` covers the rest: the fields further down that also
          failed, that nobody is focused on, and that a viewer therefore has no
          way of learning about. Without it, a failed submit is silent for
          everything except wherever focus happens to land. That is WCAG 4.1.3,
          and the reason the default is on.

          What keeps it from becoming a per-keystroke chatterbox is WHEN this
          element exists, not a debounce. It mounts only while `error` is set.
          Under react-hook-form's default `mode: 'onSubmit'`, the first time that
          happens is a submit. Re-validation afterwards runs per-change, but a
          live region speaks on MUTATION. The same sentence in the same node is
          not a mutation, so typing stays silent until the message genuinely
          becomes a different sentence, which is worth hearing. Fixing the field
          unmounts it, which is silent too. A form that validates from the first
          keystroke breaks that property, and opts out above. */}
      {error && (
        <span
          className="text-xs text-danger-11"
          id={fieldErrorId(key)}
          role={announceError ? 'alert' : undefined}
        >
          {error}
        </span>
      )}
    </Root>
  )
}
