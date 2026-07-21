// Pure domain utilities — no React, no i18n. Importable as `@/lib`.
// Only what app code consumes; tests import their module files directly.
export { isSoon, formatHour, directionsUrl } from './events'
export { formatDistance } from './distance'
export { buildEventIcs, buildGoogleCalendarUrl } from './ics'
