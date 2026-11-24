import { createContext } from 'react'

// Only the proposal story supplies these settings. The reviewed class page and discovery
// render the same components with their original presentation.
export const ClassProposalContext = createContext<{
  confirmedPlace: string
} | null>(null)

export const mobileSheet =
  'inset-x-0! top-auto! bottom-0! w-full! max-w-none! translate-x-0! translate-y-0! rounded-b-none! pb-[env(safe-area-inset-bottom)]'

export function localClassHeading(title: string, place: string) {
  const words = (text: string) =>
    ' ' +
    text
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim() +
    ' '
  const named = words(title)
  const missing = place
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !named.includes(words(part)))

  if (!missing.length) return title

  return title + (missing.length === place.split(',').length ? ' in ' : ', ') + missing.join(', ')
}
