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
  email: z.string().email().or(z.literal('')).optional(),
  /** Trimmed first, so a whitespace-only message can't satisfy the minimum. */
  message: z.string().trim().min(REPORT_MESSAGE_MIN).max(REPORT_MESSAGE_MAX),
})

export type Report = z.infer<typeof ReportSchema>
