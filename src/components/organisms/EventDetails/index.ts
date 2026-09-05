// This barrel exports only the lazy-loaded panel. Leaf files import EventHeader
// and EventRegisterBar directly (see EventView). Re-exporting them here would
// invite a static import that pulls the lazy panel chunk into the main bundle.
export { EventDetails } from './EventDetails'
export type { EventDetailsProps } from './EventDetails'
