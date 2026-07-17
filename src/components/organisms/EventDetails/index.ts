// Barrel kept to the lazy-loaded panel only. EventHeader / EventRegisterBar are
// imported by their leaf files (see EventView) — re-exporting them here would
// invite a static import that pulls the lazy panel chunk into the main bundle.
export { EventDetails } from './EventDetails'
export type { EventDetailsProps } from './EventDetails'
