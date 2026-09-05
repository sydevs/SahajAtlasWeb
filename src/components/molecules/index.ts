// Molecules: small compositions of atoms. Data passes in through props.
// This is the public import surface: `import { EventListItem } from
// '@/components/molecules'`. See DESIGN_SYSTEM.md. This barrel uses
// explicit named exports only. Each folder surfaces its primary
// component or components, plus its `Props` type. Single-use internals
// stay private.
export { SettingsMenu } from './SettingsMenu'
export type { SettingsMenuProps } from './SettingsMenu'

// SearchFilters — the controlled event-filters form (Format, Frequency,
// Day, Time, Language), rendered inside the FilterView drawer.
export { SearchFilters } from './SearchFilters'
export type { SearchFiltersProps } from './SearchFilters'

// ActiveFilterPills — the applied filters as removable pills at the top
// of the search results, rendered by the events list. It takes no props.
// It reads the filters from the URL itself.
export { ActiveFilterPills } from './ActiveFilterPills'

// ListToolbar — the controls row above a results list: a Filters
// button, plus a SortMenu on the search results. It is a thin
// justify-between layout. The views supply the controls.
export { ListToolbar } from './ListToolbar'
export type { ListToolbarProps } from './ListToolbar'

// SortMenu — the results-list sort selector (Recommended, Closest,
// Soonest), persisted in `?sort=`. A Radix DropdownMenu radio group,
// mirroring SettingsMenu.
export { SortMenu } from './SortMenu'

// Fallbacks — every state that leaves a viewer with no content, from
// one policy table (issue #89). `FallbackPanel` is the shared body. A
// dead link, a broken query, and an empty list are one component reading
// one table, not three that agree by hand. The table itself, and its
// narrowing function, stay module-private. See the folder barrel for why.
export {
  LoadingFallback,
  ErrorFallback,
  FallbackPanel,
  ResetErrorBoundary,
  CENTERED_BODY,
} from './Fallbacks'
export type { FallbackAlign, FallbackKind } from './Fallbacks'

// FormField — the label, control, and help-or-error shell shared by the
// app's forms, and `fieldErrorId`, the single definition of the
// aria-describedby id convention.
export { FormField, fieldErrorId, fieldHelpId, fieldDescribedBy } from './FormField'
export type { FormFieldProps } from './FormField'

// ActionRow / ActionCircle — the labelled tonal-circle secondary actions
// under an event's Register CTA (Directions, Website, Contact, Share).
export { ActionRow, ActionCircle } from './ActionRow'
export type { ActionRowProps, ActionCircleProps } from './ActionRow'

// EventFacts — the shared calendar and location fact block for an
// event. It builds and renders the when/where lines. The panel, the list
// card, and the share and registration drawers all use it. Its `card`
// variant is the boxed, titled treatment those two drawers use. There is
// deliberately no separate wrapper for it. The one that existed only
// added an outbound backlink that was never correct behaviour (#156).
export { EventFacts } from './EventFacts'
export type { EventFactsProps } from './EventFacts'

// The event's triage chips (type, language(s), Today). The list card
// and the event header share this, so the two never drift. `compact`
// trims the list card.
export { EventChips } from './EventChips'
export type { EventChipsProps, EventChipsVariant } from './EventChips'

export { List } from './List'

export { ListItem } from './ListItem'
export type { ListItemProps } from './ListItem'

export { EventListItem } from './EventListItem'
export type { EventListItemProps } from './EventListItem'

// NOTE: ImageCarousel, EventActions, ShareContent/CopyField, and
// AddToCalendar are deliberately NOT re-exported. The organisms barrel
// states the same rule for EventDetails and RegistrationForm. Between
// them, these own Swiper and react-share. This barrel is imported by
// EAGER views, so the re-export edge alone kept both in the first-load
// payload of every host page (about 45 KiB gz), even though nothing
// imported them through it. Tree-shaking will not drop them, since their
// `swiper/*` and react-share imports carry side effects. Every real
// consumer already reaches them by leaf path from inside a lazily-loaded
// chunk: EventActions and ImageCarousel from EventDetails, ShareContent
// from EventActions, RegistrationForm and ShareView. That is the
// readiness report's "Swiper bundled twice" finding. `index.test.ts` pins
// it (issue #96).

export { EventMetadata } from './EventMetadata'
export type { EventMetadataProps } from './EventMetadata'

// GeolocationPrompt — the dismissible IP-geolocation "events near you"
// suggestion shown above the list on the top-level views, wired by
// GeolocationSuggestion in views/shared.
export { GeolocationPrompt } from './GeolocationPrompt'
export type { GeolocationPromptProps } from './GeolocationPrompt'
