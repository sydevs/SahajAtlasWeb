import type { ReactNode } from 'react'
import type { Story, StoryDefault } from '@ladle/react'

import clsx from 'clsx'

import App from '@/App'
import { WIRE_API_KEY } from '@/mocks/wire'

export default { title: 'Interactive' } satisfies StoryDefault

/**
 * A stand-in for the page an embed sits in. Raw markup on purpose: this is the host's page, not
 * ours. Its sticky header is what the inline map sticks below and the expanded map opens under,
 * and its `h1` is why the widget's own heading is an `h2`. `blend` paints it in the widget's own
 * background, so the inline form runs on in the page rather than sitting on a card.
 */
function HostPage({ blend, children }: { blend: boolean; children: ReactNode }) {
  return (
    <div className={clsx('flex min-h-screen flex-col', blend ? 'bg-background' : 'bg-gray-2')}>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-divider bg-background px-6 font-semibold">
        A host site
      </header>
      <article className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Meditate with us</h1>
        <p className="text-gray-11">The host page&apos;s own copy, above the widget.</p>
        <div className={clsx(!blend && 'overflow-clip rounded-2xl bg-background')}>{children}</div>
        <p className="text-gray-11">And more of it below, so the page scrolls past the widget.</p>
      </article>
    </div>
  )
}

/**
 * The whole widget, interactive, as an embed renders it: browse a country down to a city, open a
 * class and register for it, search, filter, open the calendar, expand the map and close it.
 * Every SahajCloud read is answered from fixtures (`.ladle/backend.ts`): the browser lane's, over
 * a bigger atlas of real places, so every list is long enough to scroll and nothing reaches
 * production.
 */
export const Default: Story<{ map: boolean; white: boolean }> = ({ map, white }) => {
  // Map-less without a token, as the view stories are: a canvas with no tiles previews nothing.
  const hasMap = map && Boolean(import.meta.env.VITE_MAPBOX_ACCESSTOKEN)

  return (
    <HostPage blend={white}>
      <App key={String(hasMap)} inline apiKey={WIRE_API_KEY} hasMap={hasMap} />
    </HostPage>
  )
}

Default.storyName = 'Full Widget'
Default.args = { map: true, white: false }
Default.argTypes = {
  map: {
    name: 'Map',
    control: { type: 'boolean' },
    defaultValue: true,
    description: 'Off is a map=false embed',
  },
  white: {
    name: 'White background',
    control: { type: 'boolean' },
    defaultValue: false,
    description: "The host page in the widget's own background, so the inline form blends in",
  },
}
