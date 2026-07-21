import z from 'zod'

import { RegistrationQuestionNameSchema } from './event'

export const RegistrationSchema = z.object({
  startingAt: z.coerce.date(),
  name: z.string().regex(/^[a-zA-ZÀ-ÖØ-öø-ÿ\-\s]{3,}$/),
  email: z.string().email(),
  // Answers keyed by the event's enabled questions. Keys are constrained to the
  // EVENT_REGISTRATION_QUESTIONS contract and values must be strings — mirroring
  // SahajCloud's server-side validation, which 400s a non-conforming payload.
  questions: z.record(RegistrationQuestionNameSchema, z.string()).optional(),
})

export type Registration = z.infer<typeof RegistrationSchema>
