import type { Story, StoryDefault } from '@ladle/react'
import type { FallbackKind, FallbackPanelProps } from './Fallbacks'

import { StoryWrapper, StorySection } from '../../ladle'

import { LoadingFallback, ErrorFallback, FallbackPanel } from './Fallbacks'

import { countrySite } from '@/lib/country-sites'
import { mockErrorKinds, mockErrorNotes, mockErrors } from '@/mocks/errors'

export default {
  title: 'Molecules',
} satisfies StoryDefault

/**
 * The rows nothing throws to reach — a list that is legitimately empty. They sit in the
 * same `ERROR_POLICY` as the failures above precisely so a reviewer can compare them side
 * by side: a dead link and a barren region must offer the same way out, and the ones that
 * offer less must be able to say why.
 */
const EMPTY_CASES: { kind: FallbackKind; note: string; props?: Partial<FallbackPanelProps> }[] = [
  {
    kind: 'empty',
    note: 'A region whose programs have all ended. Identical to `not-found` but for the sentence — that is the whole argument for one table.',
  },
  {
    kind: 'no-results',
    note: 'Filters are both the explanation AND the escape, so this keeps "Clear all" alone: an onward link would compete with the one action that restores results.',
    props: { onClearFilters: () => {} },
  },
  {
    kind: 'no-nearby',
    note: 'The only row that offers nothing, and the only one entitled to — the list\'s own "Show distant events" control sits directly below it.',
    props: { message: { values: { km: 300 } } },
  },
  {
    kind: 'country-site',
    note: 'A searched country listing no programs at all (issue #82). The one rung that leaves the widget, so it takes the external treatment: a flag, a new tab, and the anchor glyph.',
    props: {
      message: { values: { country: 'Iceland' } },
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
 * table (issue #89): the six classified failures, plus the ways a list can legitimately
 * come back empty. What each one says and offers is `ERROR_POLICY`, not a branch.
 *
 * `ErrorFallback` is the whole-widget screen (what shows when the app fails to boot at
 * all, e.g. an embed with no API key). `FallbackPanel` is the body every drawer and every
 * empty list renders — including the dead-link cases, which reach it through the same
 * `not-found` classification. Both draw their buttons from the same `ErrorActions` row,
 * so the surfaces can differ in chrome without ever drifting on what a state permits.
 *
 * Two things only a routed drawer can supply are absent here: the prompted geocoder (it
 * wraps a Mapbox custom element, so callers pass it in) and a live recovery ladder, which
 * needs a warm region cache — so the onward rung falls to "Browse all countries". See the
 * per-view stories for both in place.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Shown via Suspense while a panel's data loads." title="Loading">
      <div className="h-64 w-full">
        <LoadingFallback />
      </div>
    </StorySection>

    <StorySection
      description="Rendered by the app-level boundary when the widget fails to boot — one section per failure kind."
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
      description="The same policy table on the body surface used by every drawer and every empty list. Nothing throws to reach these — they are data states wearing the same clothes."
      title="Empty · drawer body"
    >
      {EMPTY_CASES.map(({ kind, note, props }) => (
        <StorySection key={kind} description={note} title={kind} variant="subsection">
          <div className="h-64 w-full">
            <FallbackPanel kind={kind} {...props} />
          </div>
        </StorySection>
      ))}
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Fallbacks'
