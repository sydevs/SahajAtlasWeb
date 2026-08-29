import type { FeedbackAnswer } from '@/lib/shape'

import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { Link } from '@/components/atoms/Link'

export type FeedbackBannerProps = {
  /** Which answer the reader gave in the follow-up email. */
  answer: FeedbackAnswer
  /**
   * Route to the classes near them — the event's own region.
   *
   * Passed on the `confirmed` path, where the page below the banner is the single class they just
   * confirmed and the onward step has to be offered explicitly. Omitted on `denied`, where the
   * page below IS the region's list and a link pointing at it would send the reader to where they
   * already are.
   */
  onwardHref?: string
}

/**
 * The acknowledgement shown to someone arriving from a post-event feedback email (#164).
 *
 * Their vote is already recorded — SahajCloud wrote it before redirecting — so this thanks them
 * and gets out of the way, above the page they landed on. Announced politely (`role="status"`):
 * it is the result of something they did, not a condition needing attention.
 *
 * **The denied copy is the one that needs care, and two things about it are deliberate.** It
 * acknowledges the wasted journey before anything else, because that is what actually happened to
 * them. And it never says or implies the listing was fake: one report is not a verdict — the
 * listing only comes down at five denials with a Wilson upper bound below 0.5 — so the copy thanks
 * them for the report and stops, rather than confirming a conclusion nobody has reached.
 *
 * It also does not promise what is underneath it. An earlier draft ended "Here are other classes
 * near you", which is the ticket's suggested wording and is reachably false: the fifth denial
 * unpublishes the event, so the region a reader is redirected to can legitimately have nothing
 * left to list, and the sentence would sit directly above an empty state. The region page's own
 * list — or its empty state — says what is there; the banner says only what is true.
 *
 * Presentational only. Reading the parameter and taking it back out of the URL live in
 * `usePostEventFeedback`.
 */
export function FeedbackBanner({ answer, onwardHref }: FeedbackBannerProps) {
  const { t } = useTranslation('common')

  return (
    <Alert
      // `px-4` matches the drawer header's horizontal padding, so the banner's icon and text line
      // up with the header above it — the same alignment `GeolocationPrompt` keeps.
      className="px-4"
      color={answer === 'confirmed' ? 'primary' : 'neutral'}
      description={
        onwardHref ? (
          <Link className="underline" href={onwardHref}>
            {t('feedback.nearby')}
          </Link>
        ) : undefined
      }
      // `Check` on the confirmation; the Alert's own `Info` glyph on the acknowledgement, where a
      // tick would read as "yes, it's gone", which is a verdict this single report has not reached.
      icon={answer === 'confirmed' ? <Check size={18} /> : undefined}
      role="status"
      size="sm"
      title={t(`feedback.${answer}`)}
    />
  )
}
