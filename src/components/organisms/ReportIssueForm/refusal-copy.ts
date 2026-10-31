import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'

/**
 * The refusals a visitor fixes by changing what they typed, in this form's words.
 *
 * One intake judges an address and a link the same way whichever form sent them, so both
 * forms say the same sentence for each (#259). `RegistrationForm` spreads this into its
 * own map, so neither form can reword one of these alone. The rest stay per form: the
 * captcha sentences name the form's own verb, and the catch-all names what was not sent.
 */
export const INPUT_REFUSAL_KEYS = {
  invalid_email: 'common.report_errors.email',
  disposable_email: 'common.report_errors.disposable_email',
  urls_not_allowed: 'common.report_errors.urls_not_allowed',
} as const satisfies Partial<Record<UserSubmissionErrorCode, TranslationKey>>
