import type { ListingStep } from '@/lib/proposal'
import type { TranslationKey } from '@/types/i18next'

import { useTranslation } from 'react-i18next'

import { LISTING_STEPS } from '@/lib/proposal'

const LABELS: Record<(typeof LISTING_STEPS)[number], TranslationKey> = {
  where: 'submit.chrome.step_where',
  when: 'submit.chrome.step_when',
  details: 'submit.chrome.step_details',
  review: 'submit.chrome.step_review',
}

/**
 * Where the visitor is in the four steps: a labelled bar per step, filled up to here. A step
 * already reached is a button back to it, so the bar doubles as navigation without a menu.
 */
export function StepProgress({
  current,
  reachable,
  className,
  onPick,
}: {
  className?: string
  /** The step showing now, as its index in `LISTING_STEPS`. */
  current: number
  /** The furthest step the visitor may jump to. */
  reachable: number
  onPick: (index: number) => void
}) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('submit.chrome.progress_label')} className={className}>
      <ol className="grid grid-cols-4 gap-1.5">
        {LISTING_STEPS.map((step, index) => {
          const done = index < current
          const here = index === current
          const label = t(LABELS[step as Exclude<ListingStep, 'fix' | 'note'>])
          const bar = (
            <>
              <span
                className={`block h-1 rounded-full transition-colors ${
                  done || here ? 'bg-primary-9' : 'bg-gray-5'
                }`}
              />
              <span
                className={`mt-1.5 block truncate text-xs ${
                  here ? 'font-semibold text-foreground' : 'text-gray-11'
                }`}
              >
                {label}
              </span>
            </>
          )

          return (
            <li key={step} aria-current={here ? 'step' : undefined}>
              {index <= reachable && !here ? (
                <button
                  className="block w-full rounded-sm pb-1 text-start outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  type="button"
                  onClick={() => onPick(index)}
                >
                  {bar}
                </button>
              ) : (
                <div className="pb-1">{bar}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
