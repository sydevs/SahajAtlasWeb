import { tv } from '@/styles/tv'

// The fact list's recipe, in a leaf of its own: `EventFacts` pulls luxon through
// `use-event-display`, and its placeholder is eager, so neither can own the other's skin.
export const facts = tv({
  slots: {
    // `wrapper` and `title` are used only by the `card` variant. They stay empty otherwise.
    wrapper: '',
    title: '',
    base: 'flex flex-col',
    item: 'flex',
    icon: 'shrink-0',
    text: 'min-w-0 text-base leading-snug',
    subtext: 'text-gray-11',
  },
  variants: {
    variant: {
      default: { base: 'gap-2.5', item: 'gap-3', icon: 'text-primary' },
      // Every fact takes at least 22px, so one-line facts never sit line on line.
      compact: { base: 'gap-1.5', item: 'min-h-5.5 gap-2', icon: 'text-gray-11', text: 'text-sm' },
      card: {
        wrapper: 'rounded-lg border border-divider bg-gray-2 p-3',
        title: 'mb-3 text-lg',
        base: 'gap-2.5',
        item: 'gap-3',
        icon: 'text-primary',
      },
    },
    // A two-line fact hangs its icon beside the FIRST line. A lone line centres it.
    stacked: {
      true: { item: 'items-start' },
      false: { item: 'items-center' },
    },
  },
  compoundVariants: [
    { variant: 'default', stacked: true, class: { icon: 'mt-0.5' } },
    { variant: 'compact', stacked: true, class: { icon: 'mt-px' } },
    { variant: 'card', stacked: true, class: { icon: 'mt-0.5' } },
  ],
  defaultVariants: { variant: 'default', stacked: false },
})

// Icon pixel size per variant. It matches the text height in the compact card.
export const ICON_SIZE = { default: 20, compact: 16, card: 20 } as const
