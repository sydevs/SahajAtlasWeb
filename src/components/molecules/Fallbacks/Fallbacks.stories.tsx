import type { Story, StoryDefault } from '@ladle/react'
import type { FallbackKind, FallbackPanelProps } from './Fallbacks'

import { StoryWrapper, StorySection } from '../../ladle'

import { LoadingFallback, ErrorFallback, FallbackPanel } from './Fallbacks'

import { countrySite } from '@/lib/country-sites'
import { mockErrorKinds, mockErrorNotes, mockErrors } from '@/mocks/errors'
// This uses the real geocoder, not a stand-in. `search` is one of the
// five policy flags. A story that mocked the field would prove nothing
// about the one thing worth seeing: that it fits the column, and that its
// placeholder names itself without a prompt line. Views are leaves, since
// nothing imports a story, so this does not invert the component layering.
import { SearchField } from '@/views/shared'

export default {
  title: 'Molecules',
} satisfies StoryDefault

/**
 * One case per row of `ERROR_POLICY` that a drawer body or an empty list
 * can reach, with the actions each is meant to exercise named. So a
 * reviewer checks the CONTROLS against the table, instead of reading five
 * near-identical sentences.
 *
 * The five flags are covered as follows. Every dead-end row covers
 * `onward`. The two rows that pass a geocoder cover `search`. `no-results`
 * covers `clearFilters`. The failure kinds in the section above cover
 * `retry` and `report`. No dead end offers either: retrying a URL that
 * does not exist fails identically, and a wrong link is not ours to fix.
 */
const BODY_CASES: {
  kind: FallbackKind
  actions: string
  note: string
  props?: Partial<FallbackPanelProps>
  field?: boolean
}[] = [
  {
    kind: 'not-found-region',
    actions: 'onward + search',
    note: 'A dead link, in the register an empty list uses — a wrong turn is not a malfunction. The rung sits INSIDE the banner because it continues the sentence rather than acting on it; the field carries its own prompt in the placeholder.',
    field: true,
  },
  {
    kind: 'empty',
    actions: 'onward + search',
    note: 'A region whose programs have all ended. Asserted identical to `not-found` but for the sentence — that is the whole argument for one table.',
    field: true,
  },
  {
    kind: 'unavailable',
    actions: 'contact',
    note: 'A class that exists and is running but can’t be joined — full, ended, or registration closed. The only row whose next step is a PERSON: an organiser can still let somebody into a full class where no button of ours can, so the number leads and the onward rung stands down.',
    props: {
      message: 'This class is full.',
      contact: { phone: '+44 20 1234 5678', name: 'Anna' },
    },
  },
  {
    kind: 'unavailable',
    actions: 'onward (no contact)',
    note: 'The same row with nobody to call. `visibleActions` swaps the number for the recovery ladder, so the viewer is pointed at another class nearby rather than left holding the reason.',
    props: { message: 'This class is full.' },
  },
  {
    kind: 'share-unavailable',
    actions: 'contact',
    note: 'The share screen for a class with no link to give out — no canonical page, on a host page the widget routes off-URL on (issue #115). Same shape as `unavailable` but WITHOUT the onward rung: answering "you can\'t share this" with "see events nearby" would walk the viewer away from the class they were trying to pass on. The number leads, because a person can be told about a class where a link can\'t.',
    props: { contact: { phone: '+44 20 1234 5678', name: 'Anna' } },
  },
  {
    kind: 'share-unavailable',
    actions: 'report (no contact)',
    note: "The same row with nobody to call. With no onward rung to fall back to, `visibleActions`' promised-but-not-offered rule surfaces the report CTA — a class with neither a public page nor a contact is a gap worth hearing about, and it beats a sentence with nothing beside it.",
  },
  {
    kind: 'no-results',
    actions: 'clearFilters',
    note: 'Filters are both the explanation AND the escape, so this keeps "Clear all" alone: an onward link would compete with the one action that restores results. Rendered on SearchView, whose header already IS a geocoder — hence no field.',
    props: { onClearFilters: () => {}, hasSearchChrome: true },
  },
  {
    kind: 'no-nearby',
    actions: 'none',
    note: 'The only row that offers nothing, and the only one entitled to — the list\'s own "Show distant events" control sits directly below it. `visibleActions` leaves it alone because it promised nothing for a surface to take away.',
    props: { values: { km: 300 }, hasSearchChrome: true },
  },
  {
    kind: 'country-site',
    actions: 'onward (external)',
    note: 'A searched country listing no programs at all (issue #82). The one rung that leaves the widget, so it takes the external treatment: a flag, a new tab, and the anchor glyph.',
    props: {
      hasSearchChrome: true,
      values: { country: 'Iceland' },
      offer: {
        kind: 'country-site',
        path: countrySite('IS') ?? 'https://sahajayoga.is/',
        name: 'Iceland',
        countryCode: 'IS',
      },
    },
  },
]

/**
 * Fallbacks — every state that leaves a viewer with no content, rendered
 * from one policy table (issue #89): the five classified failures, plus
 * the ways a list can legitimately end up empty. `ERROR_POLICY` decides
 * what each one says and offers, not a branch.
 *
 * `ErrorFallback` is the whole-widget screen. It shows when the app fails
 * to boot at all, for example an embed with no API key. `FallbackPanel` is
 * the body every drawer and every empty list renders, including the
 * dead-link cases, which reach it through the same `not-found`
 * classification. Both draw from the same policy and the same
 * `FallbackActions` row, so the surfaces can differ in chrome without ever
 * drifting on what a state permits.
 *
 * Two things read differently here than in the app. The recovery ladder
 * needs a warm region cache, so every onward rung falls to its floor,
 * "Browse all countries", instead of naming a real ancestor. There is also
 * no drawer chrome around the body. See the per-view stories for both in
 * place.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Shown via Suspense while a panel's data loads." title="Loading">
      <div className="h-64 w-full">
        <LoadingFallback />
      </div>
    </StorySection>

    <StorySection
      description="Rendered by the app-level boundary when the widget fails to boot. `canNavigate: false` here — the drawer stack never mounted, so an onward rung would change the URL and leave this same screen on top of it."
      title="Error · whole widget"
    >
      {mockErrorKinds.map((kind) => (
        <StorySection
          key={kind}
          description={mockErrorNotes[kind]}
          title={kind}
          variant="subsection"
        >
          <div className="h-64 w-full">
            <ErrorFallback error={mockErrors[kind]} resetErrorBoundary={() => {}} />
          </div>
        </StorySection>
      ))}
    </StorySection>

    <StorySection
      description="The same table on the body surface used by every drawer and every empty list. Only the first is a throw — the rest are data states wearing the same clothes."
      title="Dead ends & empty lists · drawer body"
    >
      {/* Keyed on kind and actions, not kind alone. `unavailable` appears
          twice, once per branch of its contact-or-onward choice. */}
      {BODY_CASES.map(({ kind, actions, note, props, field }) => (
        <StorySection
          key={`${kind}-${actions}`}
          description={note}
          title={`${kind} — ${actions}`}
          variant="subsection"
        >
          <div className="h-80 w-full">
            <FallbackPanel kind={kind} {...props}>
              {field && <SearchField label="Or search for a place" syncToUrl={false} />}
            </FallbackPanel>
          </div>
        </StorySection>
      ))}
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Fallbacks'
