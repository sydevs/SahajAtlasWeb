import type { Story, StoryDefault } from '@ladle/react'
import type { FallbackKind, FallbackPanelProps } from './Fallbacks'

import { StoryWrapper, StorySection } from '../../ladle'

import { LoadingFallback, ErrorFallback, FallbackPanel } from './Fallbacks'

import { countrySite } from '@/lib/country-sites'
import { mockErrorKinds, mockErrorNotes, mockErrors } from '@/mocks/errors'
// The real geocoder, not a stand-in: `search` is one of the five policy flags, and a story
// that mocked the field would prove nothing about the one thing worth seeing (that it fits
// the column, and that its placeholder names itself without a prompt line). Views are
// leaves — nothing imports a story — so this doesn't invert the component layering.
import { SearchField } from '@/views/shared'

export default {
  title: 'Molecules',
} satisfies StoryDefault

/**
 * One case per row of `ERROR_POLICY` that a drawer body or an empty list can reach, with
 * the actions each is meant to exercise named — so a reviewer checks the CONTROLS against
 * the table rather than reading five near-identical sentences.
 *
 * The five flags are covered as follows: `onward` by every dead-end row, `search` by the
 * two that pass a geocoder, `clearFilters` by `no-results`, `retry`/`report` by the failure
 * kinds in the section above (no dead end offers either — retrying a URL that doesn't exist
 * fails identically, and a wrong link isn't ours to fix).
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
 * Fallbacks — every state that leaves a viewer with no content, rendered from one policy
 * table (issue #89): the five classified failures, plus the ways a list can legitimately
 * come back empty. What each one says and offers is `ERROR_POLICY`, not a branch.
 *
 * `ErrorFallback` is the whole-widget screen (what shows when the app fails to boot at
 * all, e.g. an embed with no API key). `FallbackPanel` is the body every drawer and every
 * empty list renders — including the dead-link cases, which reach it through the same
 * `not-found` classification. Both draw from the same policy and the same `FallbackActions`
 * row, so the surfaces can differ in chrome without ever drifting on what a state permits.
 *
 * Two things read differently here than in the app: the recovery ladder needs a warm region
 * cache, so every onward rung falls to its floor ("Browse all countries") rather than
 * naming a real ancestor; and there is no drawer chrome around the body. See the per-view
 * stories for both in place.
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
      {BODY_CASES.map(({ kind, actions, note, props, field }) => (
        <StorySection
          key={kind}
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
