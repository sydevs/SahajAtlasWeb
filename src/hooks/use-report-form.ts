import type { AtlasConfig, ReportForm } from '@/types'

import { useQuery } from '@tanstack/react-query'

import { atlasConfigQuery, reportFormQuery } from '@/config/api/fetch'

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
 * Whether to offer the report path at all. Every entry point gates on this — the settings row
 * directly, and the error fallbacks through `visibleActions`' `canReport` limit.
 */
export const useReportEnabled = (): boolean => {
  const { data } = useQuery(atlasConfigQuery())

  return formIdFrom(data) !== null
}

/**
 * Whether the authored form is still on its way, rather than absent.
 *
 * ⚠ **Both states carry no data, and the modal renders the second as a danger alert.** The
 * report affordances gate on the CONFIG, which resolves a round trip ahead of the form, so
 * without this a viewer who opened the settings menu in that window would be told something
 * went wrong and handed a working form a moment later. On the one screen reached BECAUSE
 * something already failed, that is the worst available guess.
 *
 * A DISABLED query stays `pending` forever in React Query, so "this atlas names no form" has to
 * read as settled — otherwise the modal would wait on a read that is never going to run.
 */
export const reportFormPending = ({
  configPending,
  formId,
  formPending,
}: {
  configPending: boolean
  formId: number | null
  formPending: boolean
}): boolean => configPending || (formId !== null && formPending)

/**
 * The authored form itself, and whether it is still on its way.
 *
 * The modal host calls this for the widget's whole life, not on open, so the read happens while
 * the page is still healthy. The form is mostly reached FROM a failure — often the network — and
 * a read fired at that moment would be the second thing to fail, leaving no way to report the
 * first.
 *
 * `isPending` is what keeps "not here yet" apart from "could not be read" — see
 * `reportFormPending`.
 */
export const useReportForm = (): { form: ReportForm | undefined; isPending: boolean } => {
  const { data: config, isPending: configPending } = useQuery(atlasConfigQuery())
  const formId = formIdFrom(config)
  const { data, isPending: formPending } = useQuery(reportFormQuery(formId))

  return { form: data, isPending: reportFormPending({ configPending, formId, formPending }) }
}
