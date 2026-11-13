// Molecules: small compositions of atoms. Data passes in through props.
// This is the public import surface: `import { EventListItem } from
// '@/components/molecules'`. See DESIGN_SYSTEM.md. This barrel uses
// explicit named exports only. Each folder surfaces its primary
// component or components, plus its `Props` type. Single-use internals
// stay private.
// AddClassEntry — the row at the foot of a place list that opens the add-a-class flow.
export { AddClassEntry } from './AddClassEntry'
export type { AddClassEntryProps } from './AddClassEntry'

export { SettingsMenu } from './SettingsMenu'
export type { SettingsMenuProps } from './SettingsMenu'

// MultiSelect — a checklist behind a field: the add-a-class details step's languages.
export { MultiSelect } from './MultiSelect'
export type { MultiSelectOption, MultiSelectProps } from './MultiSelect'

// SearchFilters — the controlled event-filters form (Where, Format, Day, Time, Language, then
// Frequency and Dates under More), rendered inside the FilterView drawer.
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
  BootFallback,
  LoadingFallback,
  ErrorFallback,
  FallbackPanel,
  ResetErrorBoundary,
  CENTERED_BODY,
} from './Fallbacks'
export type { BootFallbackProps, FallbackAlign, FallbackKind } from './Fallbacks'

// Skeleton — the placeholder shapes loading states compose, each shaped like
// what it stands in for: a list of places, a search field, a view's title,
// a class's page. The boot panel and the drawer's loading chrome draw the same
// shapes, so the hand-over between them doesn't jump.
export { EventSkeleton, FieldSkeleton, ListSkeleton, TitleSkeleton } from './Skeleton'
export type {
  EventSkeletonProps,
  FieldSkeletonProps,
  ListSkeletonProps,
  TitleSkeletonProps,
} from './Skeleton'

// FormField — the label, control, and help-or-error shell shared by the
// app's forms, and `fieldErrorId`, the single definition of the
// aria-describedby id convention.
export {
  FormField,
  TextField,
  fieldErrorId,
  fieldHelpId,
  fieldLabelId,
  fieldDescribedBy,
} from './FormField'
export type { FieldControlProps, FormFieldProps, TextFieldProps } from './FormField'

// ActionRow / ActionButton — the quiet labelled secondary actions
// under an event's Register CTA (Directions, Website, Contact, Share).
export { ActionRow, ActionButton } from './ActionRow'
export type { ActionRowProps, ActionButtonProps } from './ActionRow'

// EventFacts — the shared calendar and location fact block for an
// event. It builds and renders the when/where lines, for the class panel
// and (through EventSummary) the list card and the share and registration
// drawers.
export { EventFacts } from './EventFacts'
export type { EventFactsProps } from './EventFacts'

// EventSummary — a class at a glance (title, when and where, chips): the list card's body, and
// the boxed summary at the top of the Register and Share panels. It carries no outbound
// backlink: the earlier summary wrapper's was never correct behaviour (#156).
export { EventSummary } from './EventSummary'
export type { EventSummaryProps } from './EventSummary'

// The event's triage chips (type, language(s), Today). The list card
// and the event header share this, so the two never drift. `compact`
// trims the list card.
export { EventChips } from './EventChips'
export type { EventChipsProps, EventChipsVariant } from './EventChips'

export { List } from './List'

export { FoldSection } from './FoldSection'
export type { FoldSectionProps } from './FoldSection'

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
// it (issue #96). CopyFallback is light, but both its callers (ShareContent
// and the calendar's week Share) load lazily, so it is reached by leaf path
// too, rather than adding to the eager graph.

export { EventMetadata } from './EventMetadata'
export type { EventMetadataProps } from './EventMetadata'

// GeolocationPrompt — the dismissible IP-geolocation "events near you"
// suggestion shown above the list on the top-level views, wired by
// GeolocationSuggestion in views/shared.
export { GeolocationPrompt } from './GeolocationPrompt'
export type { GeolocationPromptProps } from './GeolocationPrompt'

// WhatToExpect — the short app-supplied promise for newcomers on a class page.
export { WhatToExpect } from './WhatToExpect'
export type { WhatToExpectProps } from './WhatToExpect'
export { ResultCountStatus } from './ResultCountStatus'
