import type { LucideIcon } from 'lucide-react'

import { tv } from 'tailwind-variants'
import { Check, ChevronRight } from 'lucide-react'

// A whole-row answer to a question: one tap picks it and moves on. Sized for a thumb (64px+),
// with the icon, a plain label and a one-line hint, so a visitor never has to read a form.
const card = tv({
  slots: {
    base: 'group flex min-h-16 w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-[background,border-color,transform] outline-none focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.99] motion-reduce:active:scale-100',
    icon: 'flex size-10 shrink-0 items-center justify-center rounded-full',
    text: 'flex min-w-0 flex-1 flex-col gap-0.5',
    label: 'text-base leading-snug font-medium',
    hint: 'text-sm leading-snug text-gray-11',
    trailing: 'size-5 shrink-0',
  },
  variants: {
    selected: {
      true: {
        base: 'border-primary-8 bg-primary-2',
        icon: 'bg-primary-9 text-white',
        trailing: 'text-primary-11',
      },
      false: {
        base: 'border-gray-6 bg-background hover:border-gray-8 hover:bg-gray-2',
        icon: 'bg-primary-3 text-primary-11',
        trailing: 'text-gray-9',
      },
    },
  },
  defaultVariants: { selected: false },
})

export type ChoiceCardProps = {
  icon: LucideIcon
  label: string
  hint?: string
  selected?: boolean
  onSelect: () => void
}

export function ChoiceCard({
  icon: Icon,
  label,
  hint,
  selected = false,
  onSelect,
}: ChoiceCardProps) {
  const slots = card({ selected })
  const Trailing = selected ? Check : ChevronRight

  return (
    <button aria-pressed={selected} className={slots.base()} type="button" onClick={onSelect}>
      <span aria-hidden className={slots.icon()}>
        <Icon size={20} />
      </span>
      <span className={slots.text()}>
        <span className={slots.label()}>{label}</span>
        {hint && <span className={slots.hint()}>{hint}</span>}
      </span>
      <Trailing aria-hidden className={slots.trailing()} />
    </button>
  )
}
