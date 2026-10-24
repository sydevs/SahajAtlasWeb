import type { Event as SahajCloudEvent } from '@/types/payload/payload-types'
import type { ProposalPayload } from '@/types'

import {
  type UserSubmissionResponse,
  contextSubmissionData,
  postUserSubmission,
  submissionData,
} from './mutate'

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

/** The `SubmissionLocation` column's own bound on each id. Anything else would refuse the whole create. */
const MAPBOX_FEATURE_ID = /^[A-Za-z0-9_=-]{1,200}$/

export const isMapboxFeatureId = (value: unknown): value is string =>
  typeof value === 'string' && MAPBOX_FEATURE_ID.test(value)

/**
 * Sends a visitor's new listing, or their correction to a published one, as a `proposal`
 * submission (#147, SahajCloud#1021). A manager reviews it, and Accept writes `proposed` to
 * Events verbatim.
 *
 * **Every key is filtered against `PROPOSABLE_EVENT_FIELDS` here**, so intake's
 * `proposed_field_invalid` stays a defect this widget cannot produce rather than copy a visitor
 * ever reads.
 *
 * ⚠ **A 201 means ACCEPTED, not reviewed.** Nothing reads the row back.
 *
 * `location` names the place's Mapbox layers, which intake matches to a region itself.
 */
const sendProposal = async (payload: ProposalPayload): Promise<UserSubmissionResponse> => {
  const proposed = Object.fromEntries(
    Object.entries(payload.proposed).filter(([key]) =>
      (PROPOSABLE_EVENT_FIELDS as readonly string[]).includes(key),
    ),
  )

  const location = Object.fromEntries(
    Object.entries(payload.location ?? {}).filter(([, id]) => isMapboxFeatureId(id)),
  )

  const json = {
    type: 'proposal',
    ...(payload.event === undefined ? {} : { event: payload.event }),
    proposed,
    ...(Object.keys(location).length > 0 ? { location } : {}),
    senderEmail: payload.senderEmail,
    submissionData: submissionData({
      // Prose the visitor wrote, bounded at the control rather than truncated here.
      note: payload.note,
      ...contextSubmissionData(payload.context),
    }),
  }

  return postUserSubmission(json, payload.turnstileToken, 'Proposal refused')
}

// Its own module, imported by the form alone rather than spread into `api`, so none of it rides
// in the eager graph.
export default {
  sendProposal,
}
