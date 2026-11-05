import type { StackEntry } from '@/lib/shape'
import type { NavNaming } from '@/views/nav-names'

import { entryName } from '@/views/nav-names'

/**
 * What a peek strip is NAMED.
 *
 * Every strip used to say `t('common.chrome.back')`. So a three-deep stack handed a screen-reader user three
 * identically-named buttons, each going to a different place — the duplicate accessible-name
 * finding in issue #102. A name that does not distinguish its target is worse than a generic
 * one. It reads as a mistake in the page, rather than a limit of it.
 *
 * The fallback chain is ordered so the label always degrades to something true: the region's
 * name, then its slug, then the plain "Back" every strip used to say.
 *
 * The root ancestor is the countries index. `resolveStack` has no entry for it. It is also
 * unique within any stack — there is only ever one root — so the bare "Back" it falls through
 * to cannot collide with a sibling strip.
 */
export function stripLabel(entry: StackEntry | undefined, naming: NavNaming): string {
  const title = entry && entryName(entry, naming)

  return title ? naming.t('common.chrome.back_to', { title }) : naming.t('common.chrome.back')
}
