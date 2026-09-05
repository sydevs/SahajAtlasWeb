// `EventsList` (presentational, ./EventsList) stays module-private. Only
// DynamicEventsList and the story use it, and both import it directly. The
// network-bound container lives in its own module, so importing the
// presentational list — from its story, for example — does not add the api
// and i18n graph.
export { DynamicEventsList } from './DynamicEventsList'
export type { DynamicEventsListProps } from './DynamicEventsList'
