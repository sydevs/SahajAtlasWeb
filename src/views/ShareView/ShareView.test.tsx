import type { Event } from '@/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ShareView } from './ShareView'

import { mockEvent, mockEventInactive } from '@/mocks/events'

// Node-only SSR assertions (see `docs/testing.md`). The share block's `label` is what the native
// share sheet, every share network and the QR poster name the class, so it is stubbed to print it.
const { eventMock } = vi.hoisted(() => ({ eventMock: { current: null as unknown } }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { city?: string }) =>
      key === 'event.display.inactive_title' ? `Meditation in ${options?.city}` : key,
  }),
}))
vi.mock('@/components/atoms/Drawer', () => ({
  DrawerBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/molecules', () => ({
  EventSummary: () => null,
  FallbackPanel: () => null,
}))
vi.mock('@/components/molecules/ShareContent', () => ({
  ShareContent: ({ label }: { label: string }) => <i data-label={label} />,
}))
vi.mock('@/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }))
vi.mock('@/hooks/use-share-url', () => ({ useShareUrl: () => 'https://example.org/event' }))
vi.mock('@/hooks/use-viewer-country', () => ({ useViewerCountry: () => 'GB' }))
vi.mock('@/views/nav', () => ({ NavHeader: () => null }))
vi.mock('@/views/shared', () => ({
  useDrawerControl: () => ({ expand: () => {} }),
  useEventFromPath: () => ({ data: eventMock.current }),
  useFrameEventOnTop: () => {},
}))

const shared = (event: Event) => {
  eventMock.current = event

  return renderToStaticMarkup(<ShareView eventPath={event.path} />).match(
    /data-label="([^"]*)"/,
  )?.[1]
}

describe('ShareView — the name it shares', () => {
  it('shares an inactive listing by its town, never its host’s own title', () => {
    expect(shared(mockEventInactive)).toBe(`Meditation in ${mockEventInactive.address?.city}`)
  })

  it('shares any other class by its own title', () => {
    expect(shared(mockEvent)).toBe(mockEvent.title)
  })
})
