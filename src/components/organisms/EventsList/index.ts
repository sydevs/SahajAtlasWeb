// `EventsList` (presentational) stays module-private — only DynamicEventsList and
// the story consume it, and both import from './EventsList' directly.
export { DynamicEventsList } from './EventsList'
export type { DynamicEventsListProps } from './EventsList'
