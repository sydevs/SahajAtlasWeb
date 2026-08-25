import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { atlasConfigQuery } from '@/config/api'
import { offeredLanguages } from '@/config/i18n-options'

/**
 * The languages this widget offers — an operator's set from the CMS, narrowed to the bundles
 * this build ships (#167).
 *
 * **Not a suspense read, and that is the boot-order decision** the ticket asked for. i18next
 * initializes at module load with the shipped bundles, this arrives afterwards, and every reader
 * gets a correct-but-wider answer in the meantime: `offeredLanguages(undefined)` is the shipped
 * inventory, which is exactly what the widget offered before the field existed. So a failed
 * global read, a client key without access to it, and an installation whose global predates the
 * field all land in the same place — today's behaviour — rather than on an error screen. Blocking the
 * whole widget on a language list would be a hard dependency bought for a dropdown.
 *
 * The read itself is warmed in parallel with `clients/me` (`api.warmLanguages`, fired from
 * `App`'s mount effect), so in practice the answer is already cached by the time anything calls
 * this and the widening is invisible. That is what stops the language guard correcting a
 * viewer's language *after* they have watched a frame of it.
 *
 * Two callers, one query key, no coordination: the guard in `AppShell` and the settings picker,
 * which a viewer may not open for ten minutes (hence the pinned `gcTime` on the factory).
 */
export function useLanguages(): string[] {
  const { data } = useQuery(atlasConfigQuery())

  // Keyed on the query result's own reference, so the array identity is stable between renders —
  // the guard in AppShell has this in an effect's dependency list, and a fresh array per render
  // would re-run it on every keystroke anywhere in the tree.
  return useMemo(() => offeredLanguages(data?.languages?.map((row) => row.code)), [data])
}
