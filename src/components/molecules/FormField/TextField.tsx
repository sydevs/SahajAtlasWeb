import type { InputProps } from '@/components/atoms/Input'
import type { TextareaProps } from '@/components/atoms/Textarea'
import type { ReactNode } from 'react'

import { forwardRef } from 'react'

import { FormField } from './FormField'

import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'

type FieldShell = {
  /** The control's id, which its label points at. */
  id: string
  label: ReactNode
  /** Marks the label (` *`) and the control (`aria-required`), the same way in every form. */
  required?: boolean
  /** Marks the field optional, for a form where everything unmarked is needed. */
  optional?: boolean
  help?: ReactNode
  /** The error sentence, shown in place of the help while set. */
  error?: ReactNode
  announceError?: boolean
}

type ControlProps<P> = Omit<P, 'id' | 'isInvalid' | 'required'>

export type TextFieldProps = FieldShell &
  (
    | ({ multiline?: false } & ControlProps<InputProps>)
    | ({ multiline: true } & ControlProps<TextareaProps>)
  )

/**
 * A labelled text field: `FormField` around an `Input`, or a `Textarea` with `multiline`, wired by
 * the field (id, help or error, `aria-required`, `isInvalid`). The one text field every form
 * shares — registration, adding or correcting a class — so a required field is marked the same
 * way in all of them. It forwards its ref to the control, so react-hook-form's `register` spreads
 * straight onto it.
 */
export const TextField = forwardRef<HTMLInputElement & HTMLTextAreaElement, TextFieldProps>(
  function TextField(
    { id, label, required, optional, help, error, announceError, multiline, ...props },
    ref,
  ) {
    return (
      <FormField
        announceError={announceError}
        error={error}
        help={help}
        htmlFor={id}
        label={label}
        optional={optional}
        required={required}
      >
        {/* `multiline` is the union's discriminant, so the rest is the matching control's props. */}
        {(control) =>
          multiline ? (
            <Textarea ref={ref} {...control} {...(props as ControlProps<TextareaProps>)} />
          ) : (
            <Input ref={ref} {...control} {...(props as ControlProps<InputProps>)} />
          )
        }
      </FormField>
    )
  },
)
