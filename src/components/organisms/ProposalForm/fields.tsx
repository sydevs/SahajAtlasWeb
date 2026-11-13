import type { NameIssue } from '@/lib/proposal'
import type { TranslationKey } from '@/types/i18next'
import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'

import { nameIssues } from '@/lib/proposal'

/**
 * The flow's pieces that are not form controls. Its controls are the shared form kit —
 * `FormField` around `Input`, `Textarea`, `ToggleGroup`, `RadioGroup` and `Checkbox`, and the
 * shared `TextField` — exactly as the report-issue and registration forms use them
 * (`DESIGN_SYSTEM.md`, "One form kit").
 */

const NAME_ISSUE_KEYS: Record<NameIssue, TranslationKey> = {
  link: 'submit.details.issue_link',
  time: 'submit.details.issue_time',
  free: 'submit.details.issue_free',
}

/** The help a name-like field shows: its guidance, or what to leave out once that's been typed. */
export function NameHelp({ value, guidance }: { value: string; guidance: ReactNode }) {
  const { t } = useTranslation()
  const issues = nameIssues(value)

  if (issues.length === 0) return guidance

  return (
    <span className="font-medium text-foreground">
      {t('submit.details.name_warning', {
        parts: issues.map((issue) => t(NAME_ISSUE_KEYS[issue])).join(', '),
      })}
    </span>
  )
}

/** A step's question, and the one line under it that says why it's asked. */
export function StepHeading({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-lg leading-snug font-semibold text-balance">{title}</h3>
      {intro && <p className="text-sm leading-snug text-gray-11">{intro}</p>}
    </div>
  )
}

/** A quiet sub-heading inside a step, for a group of related fields. */
export function GroupHeading({ title, help }: { title: string; help?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h4 className="text-sm font-semibold">{title}</h4>
      {help && <p className="text-xs leading-snug text-gray-11">{help}</p>}
    </div>
  )
}
