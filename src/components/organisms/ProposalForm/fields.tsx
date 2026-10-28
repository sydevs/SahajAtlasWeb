import type { ListingDraft, ListingErrors } from '@/lib/proposal'
import type { InputProps } from '@/components/atoms/Input'

import { Input } from '@/components/atoms/Input'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'

/** The Events title's own bound. */
export const TITLE_MAX = 100
/** The contact fields' bound on an Event. */
export const CONTACT_MAX = 100

export type StepProps = {
  draft: ListingDraft
  errors?: ListingErrors
  onChange: (patch: Partial<ListingDraft>) => void
}

/** A labelled input whose help and error text are wired to it by id. */
export function ValidatedInput({
  id,
  label,
  required,
  help,
  error,
  ...input
}: Omit<InputProps, 'id' | 'isInvalid'> & {
  id: string
  label: string
  required?: boolean
  help?: string
  /** The error sentence, shown in place of the help while set. */
  error?: string | false
}) {
  return (
    <FormField error={error} help={help} htmlFor={id} label={label} required={required}>
      <Input
        aria-describedby={fieldDescribedBy({
          name: id,
          help: Boolean(help) && !error,
          error: Boolean(error),
        })}
        id={id}
        isInvalid={Boolean(error)}
        {...input}
      />
    </FormField>
  )
}
