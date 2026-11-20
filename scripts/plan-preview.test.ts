// The decision this covers is the one that can make a green Smoke check mean nothing: it skips
// the publish, and the specs with it, while the check still reports green. Every case below was
// run by hand against real pull requests before it was a spec, which is exactly the evidence a
// later edit cannot re-run (`docs/testing.md`).

import { describe, expect, it } from 'vitest'

import {
  FILE_CAP,
  REASONS,
  SMOKE_CHECK_NAME,
  UNREAD_BY_CI,
  allUnread,
  planPreview,
} from './plan-preview.mjs'

/** A reader over canned responses, which also records what was asked. */
const reader = (responses: Record<string, unknown>) => {
  const asked: string[] = []

  return {
    asked,
    api: async (path: string) => {
      asked.push(path)

      const answer = responses[path]

      if (answer === undefined) throw new Error(`no canned answer for ${path}`)

      return answer
    },
  }
}

const compare = (...files: string[]) => ({ files: files.map((filename) => ({ filename })) })

const checkRuns = (...runs: { conclusion: string; started_at: string; slug?: string }[]) => ({
  check_runs: runs.map(({ conclusion, started_at, slug = 'github-actions' }) => ({
    conclusion,
    started_at,
    app: { slug },
  })),
})

const plan = (responses: Record<string, unknown>, action?: string) =>
  planPreview({ ...reader(responses), base: 'base0', head: 'head0', action })

describe('UNREAD_BY_CI', () => {
  // A path that reached a built or tested file would be a green Smoke check over code no spec
  // read, so both directions are pinned against real paths from this tree.
  it('covers documentation and agent config, and nothing a build or a spec reads', () => {
    for (const path of [
      'README.md',
      'CHANGELOG.md',
      'docs/embedding.md',
      'docs/rules/deployment.md',
      'src/components/AGENTS.md',
      '.claude/workflow.json',
      '.claude/hooks/unit-test.mjs',
    ])
      expect(path).toMatch(UNREAD_BY_CI)

    for (const path of [
      'src/App.tsx',
      'src/config/translations.en.json',
      'public/_headers',
      'public/robots.txt',
      'tests/smoke/root.smoke.test.ts',
      '.github/workflows/ci.yml',
      'scripts/assert-preview-host.mjs',
      'package.json',
      'pnpm-lock.yaml',
      'wrangler.jsonc',
      'index.html',
      'docs.ts',
    ])
      expect(path).not.toMatch(UNREAD_BY_CI)
  })

  // An empty compare is the shape a deleted or rewritten base produces, and "every file matched"
  // is vacuously true of it. Answering `unread` there would skip the lane on no evidence.
  it('is not satisfied by a push that changed nothing', () => {
    expect(allUnread([])).toBe(false)
    expect(allUnread(['README.md'])).toBe(true)
    expect(allUnread(['README.md', 'src/App.tsx'])).toBe(false)
  })
})

describe('planPreview', () => {
  it('skips the publish when an opening pull request changed only unread files', async () => {
    await expect(
      plan({ 'compare/base0...head0': compare('docs/testing.md') }, 'opened'),
    ).resolves.toBe('unread')
    await expect(plan({ 'compare/base0...head0': compare('README.md') }, 'reopened')).resolves.toBe(
      'unread',
    )
  })

  it('publishes when anything the build or a spec reads changed', async () => {
    await expect(plan({ 'compare/base0...head0': compare('src/App.tsx') }, 'opened')).resolves.toBe(
      'publish',
    )
    await expect(
      plan({ 'compare/base0...head0': compare('README.md', 'src/App.tsx') }, 'opened'),
    ).resolves.toBe('publish')
  })

  // Both ends of what the compare API can say nothing useful about. At the cap it has truncated
  // the list, so a match over what came back is a claim about an unknown remainder.
  it('publishes when the compare carries no files, or as many as the API returns', async () => {
    await expect(plan({ 'compare/base0...head0': compare() }, 'opened')).resolves.toBe('publish')

    const capped = compare(...Array.from({ length: FILE_CAP }, (_, i) => `docs/page-${i}.md`))

    await expect(plan({ 'compare/base0...head0': capped }, 'opened')).resolves.toBe('publish')
  })

  // The guard against a green check over a red one: on a re-push the predecessor's own smoke
  // check must have passed, because this push publishes nothing to re-read the code with.
  it('skips a re-push only when the previous head passed this job', async () => {
    const files = { 'compare/base0...head0': compare('docs/testing.md') }
    const runs = `commits/base0/check-runs?check_name=${SMOKE_CHECK_NAME}`

    await expect(
      plan(
        {
          ...files,
          [runs]: checkRuns({ conclusion: 'success', started_at: '2026-11-20T01:00:00Z' }),
        },
        'synchronize',
      ),
    ).resolves.toBe('unread')

    for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped'])
      await expect(
        plan(
          { ...files, [runs]: checkRuns({ conclusion, started_at: '2026-11-20T01:00:00Z' }) },
          'synchronize',
        ),
      ).resolves.toBe('publish')

    await expect(plan({ ...files, [runs]: checkRuns() }, 'synchronize')).resolves.toBe('publish')
  })

  // A re-run leaves two runs on one commit, and only the newest says where the code stands.
  it("reads the newest run, and only this installation's", async () => {
    const files = { 'compare/base0...head0': compare('docs/testing.md') }
    const runs = `commits/base0/check-runs?check_name=${SMOKE_CHECK_NAME}`

    await expect(
      plan(
        {
          ...files,
          [runs]: checkRuns(
            { conclusion: 'success', started_at: '2026-11-20T01:00:00Z' },
            { conclusion: 'failure', started_at: '2026-11-20T02:00:00Z' },
          ),
        },
        'synchronize',
      ),
    ).resolves.toBe('publish')

    await expect(
      plan(
        {
          ...files,
          [runs]: checkRuns({
            conclusion: 'success',
            started_at: '2026-11-20T01:00:00Z',
            slug: 'some-other-app',
          }),
        },
        'synchronize',
      ),
    ).resolves.toBe('publish')
  })

  // The predecessor is the SHA this push replaced, never the one it brings. Asking about the
  // head would read this run's own check, which has not concluded, and the skip would depend on
  // whichever answer the race produced.
  it('asks about the base, not the head', async () => {
    const { api, asked } = reader({
      'compare/base0...head0': compare('docs/testing.md'),
      [`commits/base0/check-runs?check_name=${SMOKE_CHECK_NAME}`]: checkRuns({
        conclusion: 'success',
        started_at: '2026-11-20T01:00:00Z',
      }),
    })

    await planPreview({ api, base: 'base0', head: 'head0', action: 'synchronize' })

    expect(asked).toEqual([
      'compare/base0...head0',
      `commits/base0/check-runs?check_name=${SMOKE_CHECK_NAME}`,
    ])
  })

  // A preview nobody needed costs a build. A skip nobody checked costs the lane's first
  // invariant, so every unknown answers `publish`.
  it('publishes when the API refuses either read', async () => {
    await expect(plan({}, 'opened')).resolves.toBe('publish')
    await expect(
      plan({ 'compare/base0...head0': compare('README.md') }, 'synchronize'),
    ).resolves.toBe('publish')
  })

  it('emits only the reasons it declares', async () => {
    const reason = await plan({ 'compare/base0...head0': compare('README.md') }, 'opened')

    expect(REASONS).toContain(reason)
  })
})
