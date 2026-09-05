import type { RevealMore } from '@/lib/shape'

import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'

export interface LoadMoreProps {
  /** What the control offers next — `null` when everything is revealed. */
  more: RevealMore | null
  /** Rows on screen, and rows reachable — for the polite announcement. */
  shown: number
  total: number
  /**
   * Whether a reveal has happened yet. The live region is always mounted. A
   * region added to the DOM alongside its text is not announced on its own.
   * So this region stays empty until the first press. This way, arriving at
   * the list announces nothing.
   */
  announce: boolean
  /**
   * Reveal the next page as soon as the control scrolls into view, without a
   * press. The parent decides when that is appropriate — see the note on the
   * observer below.
   */
  auto?: boolean
  /**
   * Whether the last reveal is still rendering. Nothing is fetched — every
   * match is already in memory. But a page of cards is real work. So the
   * control shows that, and stops taking presses until it finishes.
   */
  loading?: boolean
  /**
   * Reveal the next page. This forwards the trigger, because the two differ
   * in one important way. A `'press'` may need focus moved, since the last
   * press unmounts the button. An `'auto'` reveal must never touch focus,
   * because the reader only scrolled.
   */
  onReveal: (trigger: 'press' | 'auto') => void
}

/**
 * This is the foot of the search results list: the reveal control, plus the
 * polite live region that reports the new total.
 *
 * The two live together. The component stays mounted even when `more` is
 * `null`, because the LAST press is the one that unmounts the button. A live
 * region inside the button would disappear in the same commit as the change
 * it exists to announce.
 *
 * `more` also carries WHICH reveal is on offer. `'more'` pages through the
 * segment on screen. `'farther'` reaches past the distance boundary, into the
 * events beyond it. That second label is the only distance affordance in the
 * list — there is no "< N km" filter pill — so it has to say plainly what it
 * does. It signposts that nearby events have run out, rather than that the
 * list simply ended.
 *
 * This exposes no ref for focus. Focus stays on the button for free while it
 * survives a press, since it is the same DOM node. The parent already knows
 * from `more` when a press unmounted it.
 */
export function LoadMore({
  more,
  shown,
  total,
  announce,
  auto = false,
  loading = false,
  onReveal,
}: LoadMoreProps) {
  const { t } = useTranslation('common')
  const buttonRef = useRef<HTMLButtonElement>(null)

  // `onReveal` is a fresh closure every render, since it reads the current
  // rows. So this holds it in a ref, and keeps the observer's own dependency
  // list to `auto` alone. Otherwise the effect would destroy and rebuild the
  // IntersectionObserver on every render. A fresh observer fires its callback
  // immediately for an already-visible target, turning every re-render into
  // another reveal. `EventListItem` uses this same mount-once-with-a-live-ref
  // shape for the pin highlight.
  const revealRef = useRef(onReveal)

  revealRef.current = onReveal

  // Auto-reveal pages as the reader reaches the foot of the list, so the
  // ordinary case — scrolling through nearby results — needs no press at all.
  // The button stays, because it is the observed element. It also remains
  // the keyboard and screen-reader path, which never depends on a scroll
  // event firing.
  //
  // This is self-limiting. Each reveal inserts a page ABOVE the button,
  // moving it out of view until the reader reaches it again. It stops at the
  // segment boundary, because the parent withholds `auto` there. Reaching
  // the distant events stays an explicit choice.
  useEffect(() => {
    const button = buttonRef.current

    if (!auto || !button || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) revealRef.current('auto')
    })

    observer.observe(button)

    return () => observer.disconnect()
  }, [auto])

  return (
    // This has no vertical padding once the button is gone: the only child
    // left is the `sr-only` region, which is absolutely positioned and
    // contributes no height. Otherwise the padding would be a blank strip
    // under every fully-revealed list.
    <div className={clsx('flex flex-col items-center gap-2 px-4', more && 'pb-6 pt-4')}>
      {more && (
        // This stays busy, but never `disabled`, and not through the Button's
        // own `isLoading`, which also sets `disabled`. A browser unfocuses a
        // disabled element. So a keyboard user pressing this would be dropped
        // to <body> for the one commit where the flag is up. Re-enabling does
        // not bring focus back, so every press would silently cost them their
        // place. `aria-busy` says the same thing without leaving the tab
        // order. The parent's `pending` guard already makes a second press a
        // no-op, so nothing needs disabling to stay correct.
        <Button
          ref={buttonRef}
          aria-busy={loading || undefined}
          color="neutral"
          size="sm"
          variant="flat"
          onClick={() => onReveal('press')}
        >
          {loading && <Spinner decorative color="current" size="sm" />}
          {more === 'farther' ? t('results.farther') : t('results.more')}
        </Button>
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {announce ? t('results.showing', { shown, total }) : ''}
      </span>
    </div>
  )
}
