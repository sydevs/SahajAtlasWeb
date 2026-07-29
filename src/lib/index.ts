// Pure domain utilities — no React, no i18n. Importable as `@/lib`.
// Only what app code consumes; tests import their module files directly.
export { isSoon, formatHour, formatTimePeriods, directionsUrl } from './events'
export { formatDistance } from './distance'
