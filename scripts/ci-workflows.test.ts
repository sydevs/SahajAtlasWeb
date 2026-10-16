import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { APP_CONFIG, appWorkerName, readPackage } from './_wrangler-config.mjs'

// These workflows name things that live elsewhere, inside expressions no local run can
// evaluate: the domain the production lane reads, the Worker whose build fires it, and the
// wrangler the preview publish uploads with. Nothing couples any of those spellings to its
// source, and every one of the failures is silent — the lane would read a host nobody embeds
// from, or wait on a check run nobody posts again. Silence is the thing issue #244 exists to
// end.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/** A missing match must fail, not pass vacuously on `undefined`. */
const match = (text: string, re: RegExp) => {
  const found = re.exec(text)?.[1]

  expect(found, `nothing matched ${re}`).toBeTruthy()

  return found as string
}

describe('production-smoke.yml', () => {
  const lane = read('.github/workflows/production-smoke.yml')
  const target = match(lane, /^\s*PREVIEW_URL: (\S+)$/m)

  // `docs/embedding.md` is the host-facing contract, so its table decides
  // which host "production" means. Reading the other one is how #148
  // stayed invisible: the two serve one build and two sets of headers.
  it('reads the host the embedding guide calls the production domain', () => {
    expect(target).toBe(match(read('docs/embedding.md'), /`(\S+)`\s*\|\s*the production domain/))
  })

  // The trigger is the app's own Cloudflare build, never the `-design` playground's, which
  // deploys from this repo too. ⚠ The anchor is the app Worker's `name`, so a rename fails this
  // spec at collection. The `ci.yml` environment value that used to carry it went with the
  // discovery subsystem (#282).
  //
  // ⚠ The integration prefix is part of the match, because the app Worker carries the Pages
  // project's own name: `Workers Builds: sahajatlas` and `Cloudflare Pages: sahajatlas` differ
  // in nothing else, and only one of them is this lane's (#280, #297). And the comparison must
  // stay `==`: `sahajatlas` is a prefix of `sahajatlas-design`, so a `startsWith` would let the
  // playground's deploy fire the atlas's lane.
  it('waits on the Workers build of the Worker wrangler.jsonc names', () => {
    expect(match(lane, /check_run\.name == '(.+?)'/)).toBe(`Workers Builds: ${appWorkerName()}`)
  })

  // A red production read reaches a human only as an issue filed by the bot
  // login: the dispatcher's worklist labels key on the author, so an alert
  // from `github-actions[bot]` sits in the issue list and in nobody's queue.
  // That failure is silent from here — the issue exists, and the lane looks
  // like it worked.
  it('files the alert as the bot, not as the workflow', () => {
    expect(lane).toContain('GH_TOKEN: ${{ secrets.SYDEVS_BOT_PAT }}')
    expect(lane).not.toContain('secrets.GITHUB_TOKEN')
  })

  // The alert claims a production read failed, so it must fire only when one
  // did. Gating on the job instead would file a ticket for a checkout or an
  // install failure, and gating on nothing would file one per green deploy.
  it('alerts only when the smoke step itself failed', () => {
    expect(match(lane, /^\s*if: (failure\(\) && steps\.\S+\.conclusion == 'failure')$/m)).toContain(
      `steps.${match(lane, /^\s*id: (\S+)$/m)}.conclusion`,
    )
  })
})

// The smoke job publishes the preview it reads (#282), so what used to be a discovery
// question — whose build is this? — is now four couplings between the workflow and things
// outside it. Each fails silently: a drifted wrangler, an unpinned action, a stale address, or
// the one input that would write the PRODUCTION Worker's secrets.
describe('ci.yml', () => {
  const ci = read('.github/workflows/ci.yml')

  // ⚠ Sliced, not searched per assertion — and the marker is asserted first. `indexOf` returns
  // -1 for a renamed job, and `slice(-1)` would leave one character, against which every
  // negative assertion below passes by vacuum. Same rule as `match()` above.
  const at = ci.indexOf('\n  smoke:')

  if (at < 0) throw new Error('ci.yml has no `smoke:` job — every assertion below would vacuum')

  const smoke = ci.slice(at)

  // The publish must upload with the version this repo pins rather than whatever the action
  // would pick, so a behaviour change upstream arrives as a deliberate bump.
  it('uploads with the wrangler package.json pins', () => {
    const pinned = readPackage().devDependencies.wrangler.replace(/^[^\d]*/, '')

    expect(match(smoke, /^\s*wranglerVersion: '(\S+)'$/m)).toBe(pinned)
  })

  // A tag moves; a SHA does not, so a compromised release cannot arrive as an unreviewed upgrade.
  it('pins cloudflare/wrangler-action by SHA', () => {
    const refs = [...ci.matchAll(/cloudflare\/wrangler-action@(\S+)/g)].map((m) => m[1])

    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{40}$/)
  })

  // ⚠ `wrangler preview` gives an assets-only Worker a placeholder script, and the platform then
  // serves the SPA fallback to browser navigations only, so `fetch('/search')` 404s on the
  // preview while production serves the shell (#282, measured on PR #299). `versions upload`
  // routes like `wrangler deploy`. It must also never become a deploy: that moves production.
  it('uploads a version of the app Worker under the pull request alias, and deploys nothing', () => {
    const command = match(smoke, /^\s*command: (.+)$/m)

    expect(command).toMatch(/^versions upload /)
    expect(match(command, /--config (\S+)/)).toBe(APP_CONFIG)
    expect(command).toContain('--preview-alias pr-${{ github.event.pull_request.number }}')
  })

  // ⚠ The action's `secrets:` input writes the PRODUCTION Worker's secrets
  // (sydevs/SahajCloud#903). Nothing in this repo may pass it, and a run that did would look
  // like an ordinary green publish.
  it('never passes the action its production-secret-writing input', () => {
    expect(smoke).not.toMatch(/^\s*secrets:/m)
  })

  // ⚠ The alias follows the pull request across pushes, so a later push's build would answer for
  // this commit's — #138's defect, one platform along. The specs read the version's own URL,
  // which is all the action exposes as `deployment-url` for a version upload.
  it('reads the immutable preview address, not the one that follows the branch', () => {
    expect(match(smoke, /^\s*PREVIEW_URL: \$\{\{ steps\.\S+\.outputs\.(\S+) \}\}$/m)).toBe(
      'deployment-url',
    )
  })

  // ⚠ The reverse coupling, and the one `finalize-pr/SKILL.md` names: a per-commit alias under
  // the `Branch Preview URL` label freezes, so the reviewer opens a dead build two pushes
  // later. `branch-preview-url.mjs` matches the anchor's own text, so the label has to sit on
  // the address that follows the preview. Swapping the two was watched change its output.
  //
  // The alias's URL is in wrangler's stdout alone, so the guard reads it from the line wrangler
  // prints, checks it, and hands on only what it checked.
  it('labels the branch-following address in the check run, and only that one', () => {
    expect(match(smoke, /<a href=\\"\$(\w+)\\">Branch Preview URL<\/a>/)).toBe('STABLE_URL')
    expect(match(smoke, /^\s*STABLE_URL: \$\{\{ steps\.(\S+) \}\}$/m)).toBe(
      'guard.outputs.stable-url',
    )
    expect(smoke).toContain("sed -n 's/^Version Preview Alias URL: *//p'")
    expect(smoke).toContain('node scripts/assert-preview-host.mjs "$PINNED_URL" "$STABLE_URL"')
  })

  // ⚠ A bare `pnpm build` leaves `dist/_redirects`, whose splat the Workers API rejects as an
  // infinite loop (100324) and fails the whole upload (#280, #295). The pairing of the config
  // with the script that fills it is pinned in `wrangler-config.test.ts`; this is the pairing
  // of that script with the job that uploads from it.
  it('builds the upload with the script that drops _redirects', () => {
    expect(smoke).toContain('run: pnpm build:worker')
    expect(smoke).not.toMatch(/^\s*(- )?run: pnpm build$/m)
  })

  // The plan step names the states, and the report step decides which are loud. Two copies of
  // one vocabulary, in one file, with nothing between them: a reason the report does not know
  // reddens a fork's pull request, and a reason nothing emits is dead advice. Only `fork` and
  // `queue` may exit 0 — every other route to no preview fails the job, which is this lane's
  // first invariant (`docs/testing.md`).
  it('reports every state the plan step can emit, and makes only two of them quiet', () => {
    const emitted = [...smoke.matchAll(/^\s*reason=(\S+)$/gm)].map((m) => m[1])
    const handled = [...smoke.matchAll(/^\s{12}([a-z|-]+)\)$/gm)].map((m) => m[1])
    const quiet = [...smoke.matchAll(/^\s{12}(\S+)\)\n\s*FATAL=false$/gm)].map((m) => m[1])

    expect(emitted.length).toBeGreaterThan(1)
    expect([...emitted].sort()).toEqual([...handled].sort())
    expect(quiet.sort()).toEqual(['fork', 'queue'])

    // Without the fallback, a state added to the plan step and not here would inherit the
    // previous case's advice instead of going loud.
    expect(smoke).toMatch(/^\s{12}\*\)$/m)
  })

  // The guard is what refuses the `-design` playground's host. A publish step whose address
  // nothing checks is the silent green this whole lane exists to prevent.
  it('checks the published address against the app Worker', () => {
    expect(smoke).toContain('node scripts/assert-preview-host.mjs')

    const guard = read('scripts/assert-preview-host.mjs')

    // The name comes off the config, never typed in: a rename has to break the guard rather
    // than leave it anchored on a Worker that no longer exists.
    expect(guard).toContain('appWorkerName()')
  })
})
