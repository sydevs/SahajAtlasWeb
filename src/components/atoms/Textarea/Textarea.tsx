import { type TextareaHTMLAttributes, forwardRef } from 'react'

import { fieldChrome } from '@/components/atoms/Select'

// A native textarea on the shared field chrome (`fieldChrome`, `multiline` variant) — the
// textarea sibling of the Input atom, so a form's inputs + textareas share one recipe.
// Forwards its ref for react-hook-form; `isInvalid` swaps to danger AND sets `aria-invalid`
// (pair with an `aria-describedby` to the field's error text), `highlight` tints it.
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
