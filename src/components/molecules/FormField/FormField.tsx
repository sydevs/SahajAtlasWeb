import { type ReactNode } from 'react'

/**
 * The `aria-describedby` target for a field's error text. The id convention lives here
 * alone, so a field and the control pointing at it can't drift apart — pass the same
 * `htmlFor`/control name to both.
 */
export const fieldErrorId = (name?: string) => (name ? `${name}-error` : undefined)

/**
 * The `aria-describedby` target for a field's help text. Help is a hint the control must
 * carry too — "optional, we can only reply if you fill this in" is exactly the sort of
 * thing a screen-reader user needs and a sighted one gets for free — so it is addressable
 * on the same convention as the error.
 */
export const fieldHelpId = (name?: string) => (name ? `${name}-help` : undefined)

/**
 * The full `aria-describedby` value for a control: its help text, its error, or both.
 * Callers pass this straight to the control so the two ids can't be wired inconsistently.
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

export type FormFieldProps = {
  label: ReactNode
  /** Appends the required marker to the label; the caller still marks the control. */
  required?: boolean
  /** Supporting copy under the control — replaced by the error while one is showing. */
  help?: ReactNode
  error?: ReactNode
  /**
   * Whether the error announces itself when it appears (`role="alert"`). On by
   * default, because the failure this exists to prevent is silence.
   *
   * Turn it OFF for a form that validates as the viewer types. A live region speaks
   * on mutation, so under `mode: 'onChange'` the first character of an email address
   * summons an assertive "Enter a valid email address" over whatever the reader was
   * doing — an interruption reporting nothing but a half-typed field. Such a form
   * needs no announcement anyway if it gates its submit on validity, because it has
   * no failed submit to announce (`ReportIssueForm` is exactly that shape).
   */
  announceError?: boolean
  /** The control's id. Omitted for a composite control (e.g. a radio list) with no single id. */
  htmlFor?: string
  children: ReactNode
}

/**
 * Label + control + help/error — the shared shell for the app's forms (the registration
 * form and the report-issue form). It exists as a molecule rather than a copy per form
 * so the required marker, the help/error precedence, and above all the
 * `aria-describedby` id convention are defined once.
 */
export function FormField({
  label,
  required,
  help,
  error,
  htmlFor,
  children,
  announceError = true,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
        {required && ' *'}
      </label>
      {children}
      {help && !error && (
        <span className="text-xs text-gray-11" id={fieldHelpId(htmlFor)}>
          {help}
        </span>
      )}
      {/* Two jobs here, and they are not the same one (issue #102).

          `id` is the aria-describedby target, so the error is announced WITH the field
          rather than being a red border and a floating sentence a screen reader never
          connects to it. That only ever covers the field a reader is standing on.

          `role="alert"` covers the rest: the fields further down that also failed, that
          nobody is focused on and that a viewer therefore has no way of learning about.
          Without it a failed submit is silent for everything except wherever focus
          happens to land — WCAG 4.1.3, and the reason the default is on.

          What keeps it from becoming a per-keystroke chatterbox is WHEN this element
          exists, not a debounce. It is mounted only while `error` is set, and under
          react-hook-form's default `mode: 'onSubmit'` the first time that happens is a
          submit. Re-validation afterwards is per-change, but a live region speaks on
          MUTATION: the same sentence in the same node is not one, so typing is silent
          until the message genuinely becomes a different sentence — which is worth
          hearing — and fixing the field unmounts it, which is silent too. A form that
          validates from the first keystroke breaks that property and opts out above. */}
      {error && (
        <span
          className="text-xs text-danger-11"
          id={fieldErrorId(htmlFor)}
          role={announceError ? 'alert' : undefined}
        >
          {error}
        </span>
      )}
    </div>
  )
}
