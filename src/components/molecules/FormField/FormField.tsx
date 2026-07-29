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
export function FormField({ label, required, help, error, htmlFor, children }: FormFieldProps) {
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
      {/* Carries the id the control points at with aria-describedby, so the error is
          announced with the field rather than being a red border and a floating
          sentence a screen reader never connects to it. */}
      {error && (
        <span className="text-xs text-danger-11" id={fieldErrorId(htmlFor)}>
          {error}
        </span>
      )}
    </div>
  )
}
