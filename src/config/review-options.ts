// PROTOTYPE review-only switches, read once from the page's address, so an in-app navigation keeps
// them. Each goes once Anton has picked; then this file goes.
//
// `?registered=1` (12 Nov): a class's `/register` route opens on the sign-up confirmation, without
// registering. The review blocks every form submission, so this is the only live way to show it.
//
// The add-a-class and correction stage links (`…/add?step=time`, `…/correct?fix=place`) are
// review-only too. They ride in the route's own query instead, so they live in
// `lib/proposal/deep-link.ts`, with their sample in `mocks/listing.ts`; they go with this file.

const readParam = (name: string): string | null => {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

export const REGISTERED_PREVIEW: boolean =
  typeof window !== 'undefined' && readParam('registered') === '1'
