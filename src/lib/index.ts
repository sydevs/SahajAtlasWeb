// Pure domain utilities — no React, no i18n. Importable as `@/lib`.
export { isSoon, formatHour, directionsUrl } from './events'
export { formatDistance, usesMiles } from './distance'
export { buildEventIcs, buildGoogleCalendarUrl, buildRrule, exclusionDates } from './ics'
export type { IcsEventInput } from './ics'
