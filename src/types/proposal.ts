import type { ReportContext } from '@/lib/report'
import type { Event as SahajCloudEvent } from '@/types/payload/payload-types'

/**
 * The Events fields a visitor's proposal may carry (#147).
 *
 * SahajCloud's `validateProposal` refuses any key that is not a real Events field, is
 * system-written, is a join, or is privileged — ownership, lifecycle, `region`, `images` and the
 * whole registration cluster. A refused key is a 400 `proposed_field_invalid`, which no copy
 * covers because the form, not the visitor, would be at fault. This list is what keeps it
 * unreachable: `sendProposal` drops any key outside it.
 */
export const PROPOSABLE_EVENT_FIELDS = [
  'title',
  'languages',
  'contactName',
  'contactPhone',
  'contactEmail',
  'description',
  'website',
  'eventType',
  'onlineUrl',
  'address',
  'schedule',
] as const satisfies readonly (keyof SahajCloudEvent)[]

export type ProposableEventField = (typeof PROPOSABLE_EVENT_FIELDS)[number]

/**
 * The Events fields intake refuses whatever their value — `PRIVILEGED_FIELDS` in SahajCloud's
 * `src/collections/UserSubmissions/hooks/validateProposal.ts`, plus `region`, which is resolved
 * from `location` instead. Restated only so the type-level check below can fail.
 */
type PrivilegedEventField =
  | 'manager'
  | 'region'
  | '_status'
  | 'id'
  | 'deletedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'registrationMode'
  | 'externalRegistrationUrl'
  | 'registrationLimit'
  | 'registrationNotificationEmail'
  | 'registrationNotificationFrequency'
  | 'registrationQuestions'
  | 'images'

// A privileged name added to the list above fails `pnpm typecheck` here.
const noPrivilegedField: Extract<ProposableEventField, PrivilegedEventField> extends never
  ? true
  : never = true

void noPrivilegedField

type EventAddressPatch = Partial<NonNullable<SahajCloudEvent['address']>>
type EventSchedulePatch = Partial<NonNullable<SahajCloudEvent['schedule']>>

/**
 * A proposal's Events patch. Groups are partial because SahajCloud merges a proposal into its
 * target recursively, the way Payload merges an update: `{ address: { room } }` changes the
 * room and leaves the rest of the address alone. Arrays and rich text replace whole.
 */
export type ProposedEventPatch = Partial<
  Omit<Pick<SahajCloudEvent, ProposableEventField>, 'address' | 'schedule'>
> & {
  address?: EventAddressPatch
  schedule?: EventSchedulePatch
}

/**
 * The layers above where the visitor placed the class, as Mapbox feature ids — the
 * `SubmissionLocation` column, a sibling of `proposed`. Intake matches these to regions.
 */
export type ProposalLocation = {
  placeId?: string
  regionId?: string
  countryId?: string
}

/** The column's own bound on each id. Anything else would refuse the whole create. */
const MAPBOX_FEATURE_ID = /^[A-Za-z0-9_=-]{1,200}$/

export const isMapboxFeatureId = (value: unknown): value is string =>
  typeof value === 'string' && MAPBOX_FEATURE_ID.test(value)

/** What the add-a-class and correction flows hand `api.sendProposal`. */
export type ProposalPayload = {
  /** The published class a correction targets. Omitted for a new listing. */
  event?: number
  proposed: ProposedEventPatch
  location?: ProposalLocation
  /** The submitter's own address, which the review outcome goes to. Required. */
  senderEmail: string
  /** An optional note to the reviewer. */
  note?: string
  turnstileToken: string
  context: ReportContext
}
