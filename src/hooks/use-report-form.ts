import type { AtlasConfig, ReportForm } from '@/types'

import { useQuery } from '@tanstack/react-query'

import { atlasConfigQuery, reportFormQuery } from '@/config/api/fetch'
import { queryClient } from '@/config/query-client'

/**
 * The id of the authored form behind "Report an issue", or `null` when this atlas has none.
 *
 * ⚠ **Unknown counts as none.** The CMS field hides the report path when it is empty, and the
 * collection refuses a `contact` row naming no form, so an affordance offered on a config we
 * could not read would lead to a send that cannot succeed. The config is warmed at boot
 * (`api.warmConfig`) and kept for the session, so by the time an error fallback asks, the answer
 * is normally already here — a later CMS failure does not evict it.
 */
const formIdFrom = (config: AtlasConfig | undefined): number | null =>
  config?.reportIssueForm ?? null

/**
 * The same answer, read imperatively out of the cache — `currentLocales`' pattern, for a sharper
 * reason. `FallbackActions` is the one caller, and it renders on screens where the app is already
 * broken, with no query provider guaranteed above it. A hook there would throw INSIDE the error
 * fallback, which is the failure these screens exist to absorb.
 */
export const currentReportEnabled = (): boolean =>
  formIdFrom(queryClient.getQueryData<AtlasConfig>(atlasConfigQuery().queryKey)) !== null

/** Whether to offer the report path at all, for a caller that can subscribe. */
export const useReportEnabled = (): boolean => {
  const { data } = useQuery(atlasConfigQuery())

  return formIdFrom(data) !== null
}

/**
 * The authored form itself.
 *
 * The modal host calls this for the widget's whole life, not on open, so the read happens while
 * the page is still healthy. The form is mostly reached FROM a failure — often the network — and
 * a read fired at that moment would be the second thing to fail, leaving no way to report the
 * first.
 */
export const useReportForm = (): ReportForm | undefined => {
  const { data: config } = useQuery(atlasConfigQuery())
  const id = formIdFrom(config)
  const { data } = useQuery({ ...reportFormQuery(id ?? 0), enabled: id !== null })

  return id === null ? undefined : data
}
