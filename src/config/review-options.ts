// PROTOTYPE review-only switches. Each goes once Anton has picked; then this file goes.
//
// They ride in the atlas route's own query, as `?sort=` and the filters do, never in the host
// page's address: a host's own `?registered=1` (a thank-you page, say) must not reach the widget.
// So the standalone `/gb/south-east/brighton/813/register?registered=1` works as before, and an
// embed carries it inside its route (`?atlas=/gb/south-east/brighton/813/register?registered=1`
// in query routing, with the `?` inside the route encoded as the address requires).
//
// `?registered=1` (12 Nov): a class's `/register` route opens on the sign-up confirmation, without
// registering. The review blocks every form submission, so this is the only live way to show it.
//
// The add-a-class and correction stage links (`…/add?step=time`, `…/correct?fix=place`) are
// review-only too. They live in `lib/proposal/deep-link.ts`, with their sample in
// `mocks/listing.ts`; they go with this file.

export const REGISTERED_PARAM = 'registered'

/** Whether a `/register` route's own query asks to open on the confirmation. */
export const registeredPreview = (params: URLSearchParams): boolean =>
  params.get(REGISTERED_PARAM) === '1'
