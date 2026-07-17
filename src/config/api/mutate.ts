import type { Registration } from '@/types'

import z from 'zod'

import { requestJson } from './client'

// Confirmation returned by `POST /api/events/:id/register` (EventRegistrationResponse).
const RegistrationResponseSchema = z.object({
  ok: z.literal(true),
  registration: z.object({ id: z.number(), uuid: z.string() }),
})

export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>

const createRegistration = async (
  eventId: number,
  data: Registration,
): Promise<RegistrationResponse> => {
  // A custom (non-CRUD) endpoint → the SDK's raw `request` helper. `request` throws a
  // PayloadSDKError on a non-2xx, so a failed registration still rejects to the caller.
  const response = await requestJson({
    method: 'POST',
    path: `/events/${eventId}/register`,
    json: {
      email: data.email,
      name: data.name,
      startingAt: data.startingAt.toISOString(),
      questions: data.questions,
      subscribe: data.subscribe,
    },
  })

  return RegistrationResponseSchema.parse(response)
}

export default {
  createRegistration,
}
