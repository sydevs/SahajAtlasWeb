import type { InputProps } from '@/components/atoms/Input'
import type { LucideIcon } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'

import { tv } from 'tailwind-variants'

import { Input } from '@/components/atoms/Input'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'

/**
 * The flow's own field text size: the shared `field-size`, 16px on a touch screen, where anything
 * smaller makes iOS zoom the page on focus, and the app's usual 14px with a mouse.
 */
export const FIELD_TEXT = 'field-size'

/** A labelled input whose help and error text are wired to it by id. */
export function ValidatedInput({
  id,
  label,
  required,
  help,
  error,
  className,
  ...input
}: Omit<InputProps, 'id' | 'isInvalid'> & {
  id: string
  label: ReactNode
  required?: boolean
  help?: ReactNode
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
        className={`${FIELD_TEXT} h-11 md:h-10 ${className ?? ''}`}
        id={id}
        isInvalid={Boolean(error)}
        {...input}
      />
    </FormField>
  )
}

/** A step's question, and the one line under it that says why it's asked. */
export function StepHeading({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-lg leading-snug font-semibold text-balance">{title}</h3>
      {intro && <p className="text-sm leading-snug text-gray-11">{intro}</p>}
    </div>
  )
}

/** A quiet sub-heading inside a step, for a group of related fields. */
export function GroupHeading({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h4 className="text-sm font-semibold">{title}</h4>
      {help && <p className="text-xs leading-snug text-gray-11">{help}</p>}
    </div>
  )
}

const choice = tv({
  slots: {
    base: 'flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus',
    icon: 'flex size-9 shrink-0 items-center justify-center rounded-full',
    label: 'text-sm leading-tight font-semibold',
    hint: 'text-xs leading-snug',
  },
  variants: {
    selected: {
      true: {
        base: 'border-primary-9 bg-primary-2',
        icon: 'bg-primary-9 text-primary-foreground',
        hint: 'text-primary-11',
      },
      false: {
        base: 'border-gray-6 bg-background hover:bg-gray-2',
        icon: 'bg-gray-3 text-gray-11',
        hint: 'text-gray-11',
      },
    },
  },
})

/**
 * A big, plain choice — an icon, a label and a hint — for the questions a host answers with one
 * tap: in person or online, what needs fixing. A radio when `selected` is given, a button
 * otherwise.
 */
export function ChoiceCard({
  icon: Icon,
  label,
  hint,
  selected,
  tabStop,
  trailing,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  hint?: string
  selected?: boolean
  /** In a radio group, whether this card is the group's one tab stop. */
  tabStop?: boolean
  trailing?: ReactNode
  onSelect: () => void
}) {
  const slots = choice({ selected: selected ?? false })

  return (
    <button
      aria-checked={selected === undefined ? undefined : selected}
      className={slots.base()}
      role={selected === undefined ? undefined : 'radio'}
      tabIndex={tabStop === undefined ? undefined : tabStop ? 0 : -1}
      type="button"
      onClick={onSelect}
    >
      <span className={slots.icon()}>
        <Icon aria-hidden size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={slots.label()}>{label}</span>
        {hint && <span className={slots.hint()}>{hint}</span>}
      </span>
      {trailing}
    </button>
  )
}

/**
 * Arrow keys for a hand-built radio group: move to the previous or next option and pick it, as a
 * native radio group does. Spread onto the element with `role="radiogroup"`.
 */
export const radioKeys = {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]

    if (!step) return

    const radios = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
    // The event's own target, not `document.activeElement`: inside the widget's shadow root the
    // document only sees the host element.
    const at = radios.indexOf((event.target as HTMLElement).closest<HTMLElement>('[role="radio"]')!)

    if (at < 0) return
    event.preventDefault()

    const next = radios[(at + step + radios.length) % radios.length]

    next.focus()
    next.click()
  },
}
