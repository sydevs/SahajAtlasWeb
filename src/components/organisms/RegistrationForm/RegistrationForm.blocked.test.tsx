// @vitest-environment jsdom
//
// A failed security check pauses sign-up, and only sign-up: the form says why, keeps Register off,
// and offers Try again, which mounts a fresh challenge that can still succeed. The states follow
// the challenge page's messages, which only a DOM can deliver — the same reason
// `RegistrationForm.submit.test.tsx` boots one.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RegistrationForm } from './RegistrationForm'

import { challengeFrameStub, sendFromFrame } from '@/test-support/turnstile-frame'

vi.mock('@/config/i18n', () => ({ default: { resolvedLanguage: 'en' } }))

// Every key renders as itself, so an assertion names the exact copy shown.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { on: () => {}, off: () => {}, resolvedLanguage: 'en' },
  }),
}))

let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

async function mountForm() {
  const root = createRoot(container)

  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <RegistrationForm
          eventId={42}
          eventTitle="Evening meditation"
          isOnline={false}
          questions={['questions']}
          upcomingDates={[new Date('2026-12-01T18:00:00Z')]}
        />
      </QueryClientProvider>,
    )
  })

  return root
}

const frame = () => container.querySelector('iframe') as HTMLIFrameElement
const register = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')
const blockedMessage = () =>
  [...container.querySelectorAll('[role="alert"]')].find((node) =>
    node.textContent?.includes('registration.form.captcha_blocked'),
  )
const tryAgain = () =>
  [...container.querySelectorAll('button')].find(
    (node) => node.textContent === 'common.errors.retry',
  )

describe('RegistrationForm when the security check fails', () => {
  it('says why, keeps Register off and offers Try again', async () => {
    const root = await mountForm()

    await act(async () => sendFromFrame(frame(), { type: 'error' }))

    expect(blockedMessage()).toBeDefined()
    expect(register()?.disabled).toBe(true)
    expect(tryAgain()).toBeDefined()

    await act(async () => root.unmount())
  })

  it('mounts a fresh challenge on Try again, and Register works once it solves', async () => {
    const root = await mountForm()
    const first = frame()

    await act(async () => sendFromFrame(first, { type: 'error' }))
    await act(async () => tryAgain()?.click())

    expect(frame()).not.toBe(first)
    expect(blockedMessage()).toBeUndefined()

    await act(async () => challengeFrameStub(container).solve())

    expect(blockedMessage()).toBeUndefined()
    expect(register()?.disabled).toBe(false)

    await act(async () => root.unmount())
  })
})
