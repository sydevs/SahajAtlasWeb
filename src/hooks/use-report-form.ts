import type { AtlasConfig, ReportForm } from '@/types'

import { useQuery, useSuspenseQuery } from '@tanstack/react-query'

import { reportFormQuery, reportFormSuspenseQuery } from '@/config/api'
import { atlasConfigQuery } from '@/config/api/fetch'

/**
 * The id of the authored form behind "Report an issue", or `null` when this atlas has none.
 *
 * ⚠ **Unknown counts as none.** The SahajCloud field hides the report path when it is empty, and
 * the collection refuses a `contact` row naming no form, so an affordance offered on a config we
 * could not read would lead to a send that cannot succeed. The config is warmed at boot
 * (`api.warmConfig`) and kept for the session, so by the time an error fallback asks, the answer
 * is normally already here — a later CMS failure does not evict it.
 */
const formIdFrom = (config: AtlasConfig | undefined): number | null =>
  config?.reportIssueForm ?? null

/**
 * Whether this atlas offers the report path at all.
 *
 * It gates every entry point — the settings row directly, and the error fallbacks through
 * `visibleActions`' `canReport` limit — and answers off the CONFIG alone, a round trip ahead of
 * the form itself.
 *
 * ⚠ **The read stays deliberately non-suspending, in both queries.** Two of the three callers are
 * error fallbacks: a gate that suspended would blank the screen a viewer reached BECAUSE
 * something already failed, and one that threw would take that screen down with it. The form read
 * is mounted here rather than awaited, so it happens while the page is still healthy — the report
 * path is mostly reached FROM a failure, often the network, and a read fired at that moment would
 * be the second thing to fail. `useReportFormDocument` then resolves it from cache.
 */
export const useReportForm = (): { formId: number | null; enabled: boolean } => {
  const { data: config } = useQuery(atlasConfigQuery())
  const formId = formIdFrom(config)

  useQuery(reportFormQuery(formId))

  return { formId, enabled: formId !== null }
}

/**
 * The authored form itself, for a caller inside a Suspense boundary.
 *
 * The id comes from `useReportForm` rather than from another config read, because a suspending
 * read cannot be switched off: `null` has to be ruled out by the caller's own gate, not inside the
 * hook. A failed read throws here instead of resolving `undefined`, so the boundary decides what
 * the viewer sees — no component tells "not here yet" apart from "could not be read" by hand.
 */
export const useReportFormDocument = (id: number): ReportForm =>
  useSuspenseQuery(reportFormSuspenseQuery(id)).data
