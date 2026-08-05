import type { RevealMore } from '@/lib/shape'

import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'

export interface LoadMoreProps {
  /** What the control offers next — `null` when everything is revealed. */
  more: RevealMore | null
  /** The distance the "farther" reveal crosses, in km. */
  km: number
  /** Rows on screen, and rows reachable — for the polite announcement. */
  shown: number
  total: number
  /**
   * Whether a reveal has happened yet. The live region is always mounted (a region
   * added to the DOM alongside its text isn't announced), but stays empty until the
   * first press so arriving at the list says nothing.
   */
  announce: boolean
  onReveal: () => void
}

/**
 * The foot of the search results list: the reveal control, plus the polite live
 * region that reports the new total.
 *
 * The two live together, and the component stays mounted even when `more` is `null`,
 * because the LAST press is the one that unmounts the button — a live region inside
 * the button would disappear in the same commit as the change it exists to announce.
 *
 * `more` also carries WHICH reveal is on offer: `'more'` pages through the segment on
 * screen, `'farther'` crosses the "< km" boundary into events beyond it. That second
 * label is the only distance affordance in the list (there is no "< N km" filter pill),
 * so it has to say plainly what it does — it is what signposts that nearby events have
 * run out rather than that the list simply ended.
 *
 * No ref surface: focus stays on the button for free while it survives a press (same
 * DOM node), and the parent already knows from `more` when a press unmounted it.
 */
export function LoadMore({ more, km, shown, total, announce, onReveal }: LoadMoreProps) {
  const { t } = useTranslation('common')

  return (
    // No vertical padding once the button is gone: the only child left is the
    // `sr-only` region, which is absolutely positioned and contributes no height, so
    // the padding would be a blank strip under every fully-revealed list.
    <div className={clsx('flex flex-col items-center gap-2 px-4', more && 'pb-6 pt-4')}>
      {more && (
        <Button color="neutral" size="sm" variant="bordered" onClick={onReveal}>
          {more === 'farther' ? t('results.farther', { km }) : t('results.more')}
        </Button>
      )}
      <span aria-live="polite" className="sr-only" role="status">
        {announce ? t('results.showing', { shown, total }) : ''}
      </span>
    </div>
  )
}
