import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'

/**
 * The refusals a visitor fixes by changing what they typed.
 *
 * Both forms post to the one intake, and its write guard judges an address and a link the same
 * way whichever form sent them (sydevs/SahajAtlasWeb#259). So both forms say the same sentence for
 * each, and this one table is how: `ReportIssueForm` and `RegistrationForm` each spread it into
 * their own copy map, so neither can reword one of these alone.
 *
 * The other codes stay per form on purpose. The captcha sentences name the form's own verb
 * ("send", "register"), and the report's catch-all says "your report".
 */
export const INPUT_REFUSAL_KEYS = {
  invalid_email: 'common.report_errors.email',
  disposable_email: 'common.report_errors.disposable_email',
  urls_not_allowed: 'common.report_errors.urls_not_allowed',
} as const satisfies Partial<Record<UserSubmissionErrorCode, TranslationKey>>

export type InputRefusalCode = keyof typeof INPUT_REFUSAL_KEYS
