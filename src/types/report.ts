import z from 'zod'

// The viewer-typed half of an issue report (issue #79). Everything else — the widget
// path, host page, locale, client, user agent, the error that prompted it — is
// auto-attached context assembled by `buildReportContext` (src/lib/report.ts), not
// something the form validates.

export const REPORT_MESSAGE_MIN = 10
export const REPORT_MESSAGE_MAX = 5000

export const ReportSchema = z.object({
  /**
   * Optional — a report is still useful with no way to reply (the form says so).
   * An untouched input registers as `''`, which must NOT fail `.email()`, so the
   * empty string is accepted alongside a real address and read as "not given".
   * Used as `Reply-To` server-side (#80).
   */
  // Trimmed first: a trailing space would otherwise fail `.email()` with an inline error
  // pointing at a defect the viewer cannot see.
  // `.max(254)` mirrors the endpoint's own bound (SahajCloud#602). Without it an
  // over-long address passes here and 400s the whole report, surfacing as the generic
  // "could not send" with nothing pointing at the field that caused it.
  email: z.string().trim().email().max(254).or(z.literal('')).optional(),
  /** Trimmed first, so a whitespace-only message cannot satisfy the minimum. */
  message: z.string().trim().min(REPORT_MESSAGE_MIN).max(REPORT_MESSAGE_MAX),
})

export type Report = z.infer<typeof ReportSchema>
