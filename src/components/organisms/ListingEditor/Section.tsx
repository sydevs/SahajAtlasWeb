import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { tv } from 'tailwind-variants'
import { Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/atoms/Button'

// One part of the editable listing (#147). Closed, it reads exactly as the published class does
// — or, while empty, as an invitation to fill it. Open, the same spot holds its editor, so the
// visitor never leaves the listing to change it.
const section = tv({
  slots: {
    empty:
      'group flex min-h-16 w-full items-center gap-3 rounded-xl border border-dashed border-gray-7 px-3 py-3 text-start transition-colors outline-none hover:border-primary-8 hover:bg-primary-2 focus-visible:ring-2 focus-visible:ring-focus',
    badge:
      'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-3 text-primary-11 transition-colors group-hover:bg-primary-4',
    question: 'text-sm leading-snug font-semibold text-foreground',
    hint: 'text-sm leading-snug text-gray-11',
    filled:
      'flex w-full items-start gap-3 rounded-lg py-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-focus',
    open: 'scroll-mt-4 scroll-mb-28 rounded-xl border border-primary-7 bg-background p-4 shadow-sm ring-4 ring-primary-3',
  },
  variants: {
    invalid: {
      true: {
        empty: 'border-danger-8 hover:border-danger-9 hover:bg-danger-2',
        hint: 'text-danger-11',
      },
    },
  },
})

/** Room the sticky footer takes at the bottom of a bottom sheet, which a revealed panel clears. */
const FOOTER_CLEARANCE = 96

/**
 * Scrolls the nearest scrolling ancestor — the sheet's body — just enough to show `node`.
 * `scrollIntoView` would also scroll the drawer's clipped panels, which can never scroll back
 * and leave the whole sheet shifted up.
 */
const revealIn = (node: HTMLElement, behavior: ScrollBehavior) => {
  let scroller = node.parentElement

  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement
  }
  if (!scroller) return

  const box = node.getBoundingClientRect()
  const view = scroller.getBoundingClientRect()
  const below = box.bottom - (view.bottom - FOOTER_CLEARANCE)
  const above = box.top - (view.top + 16)
  // A panel taller than the view shows its top; otherwise just enough to show its bottom.
  const by = above < 0 || box.height > view.height - FOOTER_CLEARANCE ? above : Math.max(0, below)

  if (by !== 0) scroller.scrollBy({ top: by, behavior })
}

export type SectionProps = {
  id: string
  icon: LucideIcon
  /** The question the section answers — its heading when open, its prompt while empty. */
  title: string
  /** What to put here, under the prompt while empty. */
  hint: string
  required?: boolean
  /** The rendered fact once filled; `null` while there is nothing to show. */
  summary: ReactNode | null
  /** Beside the summary, still inside its tap target — a static map, say. */
  aside?: ReactNode
  open: boolean
  onOpen: () => void
  onDone: () => void
  /** Set on a correction once this section differs from the published class. */
  changed?: boolean
  onUndo?: () => void
  /** A failed Continue or Done has shown this section's errors. */
  invalid?: boolean
  /** Whether opening it should move focus into the editor — only after a visitor's own tap. */
  focusOnOpen?: boolean
  children: ReactNode
}

export function Section({
  id,
  icon: Icon,
  title,
  hint,
  required,
  summary,
  aside,
  open,
  onOpen,
  onDone,
  changed,
  onUndo,
  invalid,
  focusOnOpen,
  children,
}: SectionProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const panel = useRef<HTMLElement>(null)
  const slots = section({ invalid })

  useEffect(() => {
    const node = panel.current

    if (!open || !node) return
    // After the height animation, so the panel is measured at its full size.
    const timer = window.setTimeout(
      () => {
        revealIn(node, reduceMotion ? 'auto' : 'smooth')
        if (focusOnOpen) {
          node
            .querySelector<HTMLElement>('input:not([type=hidden]), textarea, [role=radio], button')
            ?.focus({ preventScroll: true })
        }
      },
      reduceMotion ? 0 : 220,
    )

    return () => window.clearTimeout(timer)
  }, [open, focusOnOpen, reduceMotion])

  return (
    // Enter animations only: a section swapping states is one element changing, so there is no
    // exit to choreograph, and an overlapping exit layer would push the listing around.
    <>
      {open ? (
        <motion.section
          key="open"
          ref={panel}
          animate={{ opacity: 1, height: 'auto' }}
          aria-labelledby={`${id}-title`}
          className={slots.open()}
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="mb-4 flex items-center gap-2">
            <Icon aria-hidden className="shrink-0 text-primary" size={20} />
            <h2 className="text-md leading-tight font-semibold" id={`${id}-title`}>
              {title}
            </h2>
          </div>
          <div className="flex flex-col gap-4">{children}</div>
          <div className="mt-5 flex justify-end">
            <Button className="min-w-24" color="primary" variant="solid" onClick={onDone}>
              {t('submit.chrome.done')}
            </Button>
          </div>
        </motion.section>
      ) : summary === null && !changed ? (
        <motion.button
          key="empty"
          animate={{ opacity: 1 }}
          className={slots.empty()}
          initial={reduceMotion ? false : { opacity: 0 }}
          type="button"
          onClick={onOpen}
        >
          <span className={slots.badge()}>
            <Icon aria-hidden size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={slots.question()}>{title}</span>
            <span className={`block ${slots.hint()}`}>{hint}</span>
          </span>
          {required ? (
            <span className="shrink-0 text-xs font-medium text-gray-11">
              {t('submit.chrome.required')}
            </span>
          ) : (
            <Plus aria-hidden className="shrink-0 text-gray-10" size={18} />
          )}
        </motion.button>
      ) : (
        <motion.div
          key="filled"
          animate={{ opacity: 1 }}
          // A changed section sits on a faint tint, so the edits read at a glance down the list.
          className={`flex items-start gap-2 ${changed ? '-mx-2 rounded-lg bg-primary-2 px-2 py-1.5' : ''}`}
          initial={reduceMotion ? false : { opacity: 0 }}
        >
          <button
            aria-label={`${t('submit.review.edit')}: ${title}`}
            className={slots.filled()}
            type="button"
            onClick={onOpen}
          >
            <Icon aria-hidden className="mt-0.5 shrink-0 text-primary" size={20} />
            <span className="min-w-0 flex-1 text-sm leading-snug font-medium">
              {/* A correction that cleared the part says so, and keeps its Undo. */}
              {summary ?? (
                <span className="font-normal text-gray-11 italic">
                  {t('submit.chrome.removed')}
                </span>
              )}
              {aside}
            </span>
            <Pencil aria-hidden className="mt-0.5 shrink-0 text-gray-10" size={16} />
          </button>
          {changed && (
            <div className="flex shrink-0 flex-col items-end gap-1 ps-1">
              <span className="rounded-full bg-primary-3 px-2 py-0.5 text-xs font-semibold text-primary-11">
                {t('submit.chrome.changed')}
              </span>
              {onUndo && (
                <Button
                  className="-me-2 h-7 gap-1 px-2 text-xs"
                  color="neutral"
                  size="sm"
                  variant="ghost"
                  onClick={onUndo}
                >
                  {t('submit.chrome.undo')}
                </Button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </>
  )
}
