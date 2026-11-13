import type { FixIntent, ListingSignup, ListingStep } from './draft'

/**
 * PROTOTYPE, review only: links that open the add-a-class and correction flows at one stage, so
 * each stage can be reviewed — and previewed by the pipeline — on its own (Devindra, 12 Nov). They
 * are not part of the host contract (`docs/embedding.md`), and they go with the review
 * (`config/review-options.ts`). The add links fill in a sample class (`mocks/listing.ts`), so a
 * visitor is never linked to one.
 *
 * They ride in the route's own query, as `?sort=` and the filters do, so each embedding writes
 * them its own way (`lib/shape/routing.ts`):
 *
 * - standalone (the review site's frames): `/gb/south-east/london/add?step=time`
 * - query routing: `?atlas=/gb/south-east/london/add?step=time`
 * - path routing, under a `/map` prefix: `/map/gb/south-east/london/add?atlas=step%3Dtime` — the
 *   path holds the route's path and `?atlas=` only its query, so a bare `?step=time` is the host's
 *   and opens Place
 *
 * | Route        | Parameter                                 | Opens                                                  |
 * | ------------ | ----------------------------------------- | ------------------------------------------------------ |
 * | `…/add`      | `step=place\|time\|details\|check`         | that stage, the stages before it filled with a sample |
 * | `…/add`      | `signup=elsewhere\|here`                   | Details, with that sign-up answer (and a Meetup link)  |
 * | `…/add`      | `duplicate=<class id>`                    | Check, re-adding that listed class's place and time    |
 * | `…/correct`  | `fix=time\|place\|details\|nobody\|stopped\|other` | that answer to "What needs fixing?"            |
 *
 * Each parameter opens its state alone, so a link needs only one (an `&` inside `?atlas=` must
 * be written `%26`). They are read once, when the flow opens; after that the flow's own steps
 * take over, and nothing writes them back.
 */

export const STEP_PARAM = 'step'
export const SIGNUP_PARAM = 'signup'
export const DUPLICATE_PARAM = 'duplicate'
export const FIX_PARAM = 'fix'

/** The stages by the names the flow shows them under (Place, Time, Details, Check). */
const STEPS: Record<string, ListingStep> = {
  place: 'where',
  time: 'when',
  details: 'details',
  check: 'review',
}

/** The answers to "What needs fixing?", by the same names. */
const FIXES: Record<string, FixIntent> = {
  time: 'when',
  place: 'where',
  details: 'details',
  nobody: 'nobody',
  stopped: 'stopped',
  other: 'other',
}

const SIGNUPS: readonly ListingSignup[] = ['here', 'elsewhere']

/** Where an add link opens, and what it fills in beyond the sample. */
export type AddLink = {
  step: ListingStep
  signup?: ListingSignup
  /** A listed class whose place and time the draft copies, to show the duplicate suggestion. */
  duplicateOf?: number
}

/** A table's own entry for a value, never an inherited one (`?step=constructor`). */
const lookup = <T>(table: Record<string, T>, value: string | null): T | undefined => {
  const key = value?.toLowerCase()

  return key !== undefined && Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : undefined
}

/**
 * The add flow's deep link, or null when the query names none. An unknown value is no link,
 * so the flow opens as usual rather than at a guess.
 */
export const addLinkFromParams = (params: URLSearchParams): AddLink | null => {
  const step = lookup(STEPS, params.get(STEP_PARAM))
  const signup = SIGNUPS.find((value) => value === params.get(SIGNUP_PARAM)?.toLowerCase())
  const id = Number(params.get(DUPLICATE_PARAM))
  const duplicateOf = Number.isInteger(id) && id > 0 ? id : undefined

  if (!step && !signup && !duplicateOf) return null

  return {
    // The sign-up question is on Details, and a duplicate shows on Check.
    step: step ?? (duplicateOf ? 'review' : 'details'),
    ...(signup && { signup }),
    ...(duplicateOf && { duplicateOf }),
  }
}

/** The correction flow's deep link: the answer to "What needs fixing?" it opens on, if any. */
export const fixFromParams = (params: URLSearchParams): FixIntent | null =>
  lookup(FIXES, params.get(FIX_PARAM)) ?? null
