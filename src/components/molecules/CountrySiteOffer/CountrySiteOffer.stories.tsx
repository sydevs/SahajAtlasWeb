import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { CountrySiteOffer } from './CountrySiteOffer'

import { COUNTRY_SITES } from '@/lib/country-sites'

export default { title: 'Molecules' } satisfies StoryDefault

// A spread of the real mapping: a plain `https` domain, a `http://` entry kept as
// published, a Facebook page, and a shared multi-country site.
const EXAMPLES = ['IS', 'GB', 'TH', 'UZ']

/**
 * CountrySiteOffer — the next step shown when a search lands in a country that lists
 * no programs at all: its national Sahaja Yoga site. The neighbouring empty states'
 * `Alert`, flagged and named in the viewer's language, with an external link that
 * opens in a new tab (`rel="noopener noreferrer"`). Country name comes from
 * `Intl.DisplayNames`, so it follows the story's language.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="One neutral Alert per country — flag, the “nothing listed yet” line, and the link out to the country's own site. The URLs are the real COUNTRY_SITES entries, including one plain http:// and one Facebook page."
      title="Country website offer"
    >
      <div className="flex max-w-sm flex-col gap-4">
        {EXAMPLES.map((code) => (
          <CountrySiteOffer key={code} countryCode={code} href={COUNTRY_SITES[code]} />
        ))}
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Country Site Offer'
