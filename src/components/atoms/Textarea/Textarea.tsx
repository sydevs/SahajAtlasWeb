import { type TextareaHTMLAttributes, forwardRef } from 'react'

import { fieldChrome } from '@/components/atoms/Select'

// A native textarea on the shared field chrome (`fieldChrome`, `multiline`
// variant). It is the textarea sibling of the Input atom, so a form's
// inputs and textareas share one recipe. It forwards its ref for
// react-hook-form. `isInvalid` swaps to danger and sets `aria-invalid`
// (pair it with an `aria-describedby` to the field's error text).
// `highlight` tints the field.
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isInvalid?: boolean
  highlight?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { isInvalid, highlight, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={isInvalid || undefined}
      className={fieldChrome({ isInvalid, highlight, multiline: true, className })}
      {...props}
    />
  )
})
