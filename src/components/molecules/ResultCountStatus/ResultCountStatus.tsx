import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Long enough for a screen reader to register the empty region before its text arrives. */
const ANNOUNCE_DELAY_MS = 150

/**
 * A hidden line that tells a screen reader how many classes a list now holds.
 *
 * The text arrives just after mount, rather than with it, because these lists remount when a
 * filter changes, and a live region usually stays silent about text it was born with.
 */
export function ResultCountStatus({ total }: { total: number }) {
  const { t } = useTranslation()
  const [announced, setAnnounced] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(total), ANNOUNCE_DELAY_MS)

    return () => clearTimeout(timer)
  }, [total])

  return (
    <p className="sr-only" role="status">
      {announced === null ? '' : t('common.chrome.classes_found', { count: announced })}
    </p>
  )
}
