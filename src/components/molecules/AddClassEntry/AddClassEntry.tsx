import { ChevronRight, Plus } from 'lucide-react'

import { Link } from '@/components/atoms/Link'
import { listRow } from '@/components/molecules/List/List'

export type AddClassEntryProps = {
  href: string
  label: string
  hint: string
}

/**
 * The way into the add-a-class flow, at the foot of a place list and under an empty one. A real
 * row rather than a footnote: hosts asked how to get listed, because the small grey line under a
 * list did not read as an answer.
 */
export function AddClassEntry({ href, label, hint }: AddClassEntryProps) {
  return (
    <Link
      className={listRow({
        className: 'flex min-h-14 flex-row items-center gap-3 border-t border-divider py-3',
      })}
      href={href}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-3 text-primary-11">
        <Plus aria-hidden size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base font-semibold">{label}</span>
        <span className="text-sm text-gray-11">{hint}</span>
      </span>
      <ChevronRight aria-hidden className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
    </Link>
  )
}
