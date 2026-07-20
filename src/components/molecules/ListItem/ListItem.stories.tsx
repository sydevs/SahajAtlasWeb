import type { Story, StoryDefault } from '@ladle/react'

import { CircleFlag } from 'react-circle-flags'

import { StoryWrapper, StorySection } from '../../ladle'

import { ListItem } from './ListItem'

import { List } from '@/components/molecules/List'
import { MonitorIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules / List' } satisfies StoryDefault

const FLAG_CLASS = 'h-full w-full rounded-full border border-divider bg-divider'

/**
 * ListItem — a single navigable row (optional leading glyph, label, optional
 * subtitle, count, trailing arrow). It backs every row in a region list: the
 * country → region → area drill-down, and the online-classes entry that belongs
 * to no region at all. The glyph is the only thing that varies, and the card's
 * fixed icon slot keeps every row aligned whatever goes in it.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Variants">
      <div className="flex max-w-md flex-col gap-6">
        <StorySection title="Minimal" variant="subsection">
          <ListItem count={12} href="#area" label="Cambridge" />
        </StorySection>

        <StorySection title="Maximal" variant="subsection">
          <ListItem
            count={7}
            href="#area"
            icon={<CircleFlag className={FLAG_CLASS} countryCode="gb" />}
            label="Oxford"
            subtitle="Oxfordshire"
          />
        </StorySection>
      </div>
    </StorySection>

    <StorySection
      description="The slot sizes and spaces the glyph, so a filled circular flag and a line icon sit on the same baseline and the labels line up. Callers pass the bare glyph — no per-call-site margins."
      title="Icon slot"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <ListItem
            count={41}
            href="#online"
            icon={<MonitorIcon size={24} />}
            label="Online Classes"
          />
          <ListItem
            count={12}
            href="#country"
            icon={<CircleFlag className={FLAG_CLASS} countryCode="in" />}
            label="India"
          />
          <ListItem count={3} href="#country" label="No flag available" />
        </List>
      </div>
    </StorySection>

    <StorySection
      description="The country list: online classes lead as a placeless entry, then flagged countries."
      inContext={true}
      title="Examples"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <ListItem
            count={41}
            href="#online"
            icon={<MonitorIcon size={24} />}
            label="Online Classes"
          />
          <ListItem
            count={128}
            href="#country"
            icon={<CircleFlag className={FLAG_CLASS} countryCode="in" />}
            label="India"
          />
          <ListItem
            count={64}
            href="#country"
            icon={<CircleFlag className={FLAG_CLASS} countryCode="gb" />}
            label="United Kingdom"
          />
          <ListItem
            count={22}
            href="#country"
            icon={<CircleFlag className={FLAG_CLASS} countryCode="it" />}
            label="Italy"
          />
        </List>
      </div>
    </StorySection>

    <StorySection
      description="Inside a region, the same card drills into sub-regions — no glyph, so the label starts at the row gutter."
      inContext={true}
      title="Examples"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <ListItem count={12} href="#area" label="Cambridge" subtitle="Cambridgeshire" />
          <ListItem count={7} href="#area" label="Oxford" subtitle="Oxfordshire" />
          <ListItem count={3} href="#area" label="London" subtitle="Greater London" />
        </List>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'List Item'
