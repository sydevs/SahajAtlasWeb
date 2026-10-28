import type { ProposableEventField } from '@/config/api/proposal'
import type { ReportContext } from '@/lib/report'
import type { Event as SahajCloudEvent } from '@/types/payload/payload-types'

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

/** What the add-a-class and correction flows hand `sendProposal`. */
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
