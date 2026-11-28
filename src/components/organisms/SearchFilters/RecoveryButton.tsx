import { useTranslation } from 'react-i18next'

import { Button, type ButtonProps } from '@/components/atoms/Button'
import { useAnswerLabels } from '@/hooks/use-answer-labels'
import { type EventFilters, type FilterRecovery } from '@/lib/shape'

export type RecoveryButtonProps = {
  recovery: FilterRecovery
  filters: EventFilters
  onApply: (next: EventFilters) => void
  className?: string
  /** Solid at the bottom of the filters; a link under an empty list of results. */
  variant?: ButtonProps['variant']
}

/** The way out of "No classes match": it names the answer it removes, and what that brings back. */
export function RecoveryButton({
  recovery,
  filters,
  onApply,
  className,
  variant,
}: RecoveryButtonProps) {
  const { t } = useTranslation()
  const labels = useAnswerLabels(filters)

  return (
    <Button
      className={className}
      color="primary"
      variant={variant}
      onClick={() => onApply({ ...filters, ...recovery.patch })}
    >
      <span className="truncate">
        {t('filters.chrome.widen', { label: labels[recovery.group], count: recovery.count })}
      </span>
    </Button>
  )
}
