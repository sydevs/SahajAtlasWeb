// Only the mounted host is public — `ReportIssueForm` is reached solely through it (and
// its own story), so per DESIGN_SYSTEM.md's single-use rule it stays module-private.
export { ReportIssueModal } from './ReportIssueModal'
export type { ReportIssueModalProps } from './ReportIssueModal'
