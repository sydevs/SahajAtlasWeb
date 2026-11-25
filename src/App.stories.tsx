import type { ReactNode } from 'react'
import type { Story, StoryDefault } from '@ladle/react'

import App from '@/App'
import { SAHAJCLOUD_API_KEY } from '@/mocks/sahajcloud'

export default { title: 'Interactive' } satisfies StoryDefault

/**
 * A stand-in for the page an embed sits in. Raw markup on purpose: this is the host's page, not
 * ours. Its `h1` is why the widget's own heading is an `h2`, and the copy around the widget is
 * what a contained map scrolls past.
 */
function HostPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-2">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-divider bg-background px-6 font-semibold">
        A host site
      </header>
      <article className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Meditate with us</h1>
        <p className="text-gray-11">The host page&apos;s own copy, above the widget.</p>
        <div className="h-[640px] overflow-clip rounded-2xl bg-background">{children}</div>
        <p className="text-gray-11">And more of it below, so the page scrolls past the widget.</p>
      </article>
    </div>
  )
}

/**
 * The whole widget, interactive, as an embed in a 640px box renders it: browse a country down to a
 * city, open a class and register for it, search, filter, open the calendar. Every SahajCloud read
 * is answered from fixtures (`.ladle/backend.ts`): the browser lane's, over a bigger atlas of real
 * places, so every list is long enough to scroll and nothing reaches production.
 */
export const Default: Story<{ map: boolean }> = ({ map }) => {
  // Map-less without a token, as the view stories are: a canvas with no tiles previews nothing.
  const hasMap = map && Boolean(import.meta.env.VITE_MAPBOX_ACCESSTOKEN)

  return (
    <HostPage>
      <App key={String(hasMap)} contained apiKey={SAHAJCLOUD_API_KEY} hasMap={hasMap} />
    </HostPage>
  )
}

Default.storyName = 'Full Widget'
Default.args = { map: true }
Default.argTypes = {
  map: {
    name: 'Map',
    control: { type: 'boolean' },
    defaultValue: true,
    description: 'Off is a map=false embed',
  },
}
