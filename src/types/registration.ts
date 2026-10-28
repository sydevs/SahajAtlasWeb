import z from 'zod'

import { RegistrationQuestionNameSchema } from './event'

export const RegistrationSchema = z.object({
  startingAt: z.coerce.date(),
  name: z.string().regex(/^[a-zA-ZÀ-ÖØ-öø-ÿ\-\s]{3,}$/),
  email: z.string().email(),
  // Answers keyed by the event's enabled questions. Keys are constrained to the
  // EVENT_REGISTRATION_QUESTIONS contract and values must be strings — mirroring
  // SahajCloud's server-side validation, which 400s a non-conforming payload.
  // `partialRecord`, not `record`: an event enables a SUBSET of the questions, and
  // zod's `record` over an enum key requires every member.
  questions: z.partialRecord(RegistrationQuestionNameSchema, z.string()).optional(),
})

export type Registration = z.infer<typeof RegistrationSchema>

/**
 * What the FORM holds, which is not what a submission is: `startingAt` is typed `unknown` until
 * the coercion runs, so react-hook-form's field values are the schema's INPUT and only
 * `handleSubmit` sees a `Date`. Drop the distinction and the resolver stops type-checking.
 */
export type RegistrationInput = z.input<typeof RegistrationSchema>
