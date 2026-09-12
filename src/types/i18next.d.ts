import 'i18next'

import type { WidgetTranslations } from './translations'

import snapshot from '@/config/translations.en.json'

/**
 * This types every `t()` key against the committed English snapshot (#198).
 *
 * A misspelled key used to be invisible until it rendered as its own dotted name in front of a
 * visitor. With this, `pnpm typecheck` rejects it — which is what makes a 193-key rename across
 * 33 files a mechanical change rather than a leap of faith.
 *
 * The `satisfies` below is the other half, and it points the other way: it checks the snapshot
 * against the CMS's OWN generated types (`pnpm types:cms`), so a group renamed or dropped in
 * SahajCloud fails the build here rather than at runtime. Without it the snapshot would be
 * self-certifying — it would type the call sites against itself, however far it had drifted from
 * the CMS that actually answers.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof snapshot }
  }
}

// Not an assignment: a bare `satisfies` expression statement, so nothing is exported and no
// lint rule has an unused binding to complain about. The check happens at compile time either way.
snapshot satisfies WidgetTranslations

/**
 * One key, as `t()` accepts it. A dynamic family — `filters.time.${period}`, a `messageKey` held
 * in a policy table — is a key the type system cannot narrow on its own, so those few sites name
 * this type rather than widening to `string` and losing the check everywhere else.
 */
export type TranslationKey = import('i18next').ParseKeys
