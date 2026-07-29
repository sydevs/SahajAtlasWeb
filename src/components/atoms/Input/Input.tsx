import { type InputHTMLAttributes, forwardRef } from 'react'

import { fieldChrome } from '@/components/atoms/Select'

// A native text input on the shared field chrome (`fieldChrome`) — one styled surface
// for the registration form + filter date bounds, replacing hand-rolled `<input>` +
// `fieldChrome(...)` call sites. Forwards its ref so react-hook-form's `register` works.
// `isInvalid` swaps to the danger border AND sets `aria-invalid` (the atom owns the error
// affordance — pair it with an `aria-describedby` pointing at the field's error text);
// `highlight` primary-tints an active field.
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
