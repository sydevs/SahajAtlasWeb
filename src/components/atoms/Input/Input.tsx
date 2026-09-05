import { type InputHTMLAttributes, forwardRef } from 'react'

import { fieldChrome } from '@/components/atoms/Select'

// A native text input on the shared field chrome (`fieldChrome`). It is one
// styled surface for the registration form and the filter date bounds. It
// replaces hand-rolled `<input>` and `fieldChrome(...)` call sites. It
// forwards its ref, so react-hook-form's `register` works. `isInvalid` swaps
// to the danger border and sets `aria-invalid`. The atom owns the error
// affordance: pair it with an `aria-describedby` that points at the field's
// error text. `highlight` primary-tints an active field.
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  isInvalid?: boolean
  highlight?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { isInvalid, highlight, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={isInvalid || undefined}
      className={fieldChrome({ isInvalid, highlight, className })}
      {...props}
    />
  )
})
