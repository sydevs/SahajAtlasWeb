// `EventsList` (presentational, ./EventsList) stays module-private — only
// DynamicEventsList and the story consume it, and both import it directly. The
// network-bound container lives in its own module so importing the presentational
// list (e.g. from its story) doesn't drag in the api/i18n graph.
export { DynamicEventsList } from './DynamicEventsList'
export type { DynamicEventsListProps } from './DynamicEventsList'
