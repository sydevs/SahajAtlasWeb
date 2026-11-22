// These workflows name things that live elsewhere, inside expressions no local run can
// evaluate: the domain the production lane reads, the Worker whose build fires it, and the
// wrangler the preview publish uploads with. Nothing couples any of those spellings to its
// source, and every one of the failures is silent — the lane would read a host nobody embeds
// from, or wait on a check run nobody posts again. Silence is the thing issue #244 exists to
// end.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { REPO_ROOT, readRepoSource } from '../src/test-support/repo-source'

import { APP_CONFIG, appWorkerName, readPackage } from './_wrangler-config.mjs'

/** A missing match must fail, not pass vacuously on `undefined`. */
const match = (text: string, re: RegExp) => {
  const found = re.exec(text)?.[1]

  expect(found, `nothing matched ${re}`).toBeTruthy()

  return found as string
}

/** The events under a workflow's `on:` block, sorted. */
const workflowEvents = (workflow: string) => {
  const lines = workflow.split('\n')
  const opens = lines.indexOf('on:')

  if (opens < 0) throw new Error('the workflow has no `on:` block — the assertion would vacuum')

  const after = lines.slice(opens + 1)
  const closes = after.findIndex((line) => /^\S/.test(line))

  return (closes < 0 ? after : after.slice(0, closes))
    .flatMap((line) => /^ {2}(\w+):/.exec(line)?.[1] ?? [])
    .sort()
}

/**
 * One job's text, up to the next job at column 2, so no assertion can be satisfied by a
 * neighbouring job's steps. A renamed job throws rather than leaving a slice every negative
 * assertion passes against.
 */
const jobIn = (workflow: string, name: string) => {
  const at = workflow.indexOf(`\n  ${name}:\n`)

  if (at < 0) throw new Error(`no \`${name}:\` job — every assertion about it would vacuum`)

  const rest = workflow.slice(at + 1)
  const next = rest.slice(1).search(/^ {2}\S/m)

  return next < 0 ? rest : rest.slice(0, next + 1)
}

/** A job's steps, one per `- ` at step indentation. */
const steps = (job: string) => job.split(/^ {6}- /m).slice(1)

/** The `actions/cache*` actions a workflow or a job uses, in order. */
const cacheActions = (scope: string) =>
  [...scope.matchAll(/^\s*(?:- )?uses: (actions\/cache\S*)@/gm)].map((m) => m[1])

/** `browser-cache.yml`, the one writer of the browser cache both `ci.yml` consumers restore. */
const warmWorkflow = readRepoSource('.github/workflows/browser-cache.yml')

describe('production-smoke.yml', () => {
  const lane = readRepoSource('.github/workflows/production-smoke.yml')
  const target = match(lane, /^\s*PREVIEW_URL: (\S+)$/m)

  // `docs/embedding.md` is the host-facing contract, so its table decides
  // which host "production" means. Reading a vendor host instead is how #148
  // stayed invisible: it and the custom domain served one build and two sets
  // of headers, and only the domain hosts embed from.
  it('reads the host the embedding guide calls the production domain', () => {
    expect(target).toBe(
      match(readRepoSource('docs/embedding.md'), /`(\S+)`\s*\|\s*the production domain/),
    )
  })

  // The trigger is the app's own Cloudflare build, never the `-design` playground's, which
  // deploys from this repo too. ⚠ The anchor is the app Worker's `name`, so a rename fails this
  // spec at collection. The `ci.yml` environment value that used to carry it went with the
  // discovery subsystem (#282).
  //
  // ⚠ The integration prefix is part of the match: while the `sahajatlas` Pages project and a
  // Worker of the same name both posted, `Workers Builds: sahajatlas` and
  // `Cloudflare Pages: sahajatlas` differed in nothing else (#280, #297). And the comparison must
  // stay `==`: a `startsWith` or a `contains` accepts any check-run name that EXTENDS this one,
  // and this repo already builds a second Worker.
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

  // The alert is all a responder is handed, and it names a section of another file. A renamed
  // heading would leave it pointing at nothing.
  it('points the alert at the rollback runbook, by a heading that exists', () => {
    const [, file, heading] =
      /To roll production back: \\`([^\\]+)\\`, section '([^']+)'/.exec(lane) ?? []

    expect(file).toBe('docs/rules/deployment.md')
    expect(readRepoSource(file)).toContain(`\n## ${heading}\n`)
  })
})

// The smoke job publishes the preview it reads (#282), so what used to be a discovery
// question — whose build is this? — is now four couplings between the workflow and things
// outside it. Each fails silently: a drifted wrangler, an unpinned action, a stale address, or
// the one input that would write the PRODUCTION Worker's secrets.
describe('ci.yml', () => {
  const ci = readRepoSource('.github/workflows/ci.yml')

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

  // ⚠ The upload must run the Worker's own build script, not the plain one. A `dist/_redirects`
  // splat is rejected by the Workers API as an infinite loop (100324) and fails the whole upload
  // (#280, #295); #283 deleted the file, so the guard is dormant rather than gone. The pairing of
  // the config with the script that fills it is pinned in `wrangler-config.test.ts`; this is the
  // pairing of that script with the job that uploads from it.
  it("builds the upload with the app Worker's own build script", () => {
    expect(smoke).toContain('run: pnpm build:worker')
    expect(smoke).not.toMatch(/^\s*(- )?run: pnpm build$/m)
  })

  // ⚠ The plan step decides whether to publish; the build step consumes what it decided on.
  // Gating on fewer secrets than the build reads lets a half-entered set upload a build with a
  // `VITE_*` value inlined as empty, which arrives as a red `boot-origins` spec blaming the
  // deploy rather than as the missing secret it is (PR #299). Neither list can move alone.
  it('gates the publish on every secret the preview build reads', () => {
    const gated = [...match(smoke, /^\s*HAS_SECRETS: (.+)$/m).matchAll(/secrets\.(\w+)/g)]
    const read = [...smoke.matchAll(/\$\{\{ secrets\.((?:VITE|CLOUDFLARE)_\w+) \}\}/g)]

    expect(read.length).toBeGreaterThan(0)
    expect([...new Set(gated.map((m) => m[1]))].sort()).toEqual(
      [...new Set(read.map((m) => m[1]))].sort(),
    )
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

  // A Dependabot branch is same-repo, and a run Dependabot triggers reads the Dependabot secrets,
  // never the Actions ones. Left to `no-credentials`, its red tells the reader to add Actions
  // secrets that are already entered. The test sits INSIDE the same-repo branch, so a fork stays
  // a fork, and the vocabulary pin above keeps the reason loud: only the advice differs.
  it('gives a run Dependabot triggered its own reason, inside the same-repo branch', () => {
    expect(match(smoke, /^\s*ACTOR: (.+)$/m)).toBe('${{ github.actor }}')
    expect(smoke).toMatch(
      /\[ "\$SAME_REPO" = "true" \]; then\n\s*if \[ "\$ACTOR" = "dependabot\[bot\]" \]; then\n\s*reason=dependabot\n\s*else\n\s*reason=no-credentials\n\s*fi\n\s*else\n\s*reason=fork\n/,
    )

    // The advice names a section of another file, and a renamed heading is dead advice.
    const advice = match(smoke, /^\s{12}dependabot\)\n([\s\S]*?)^\s{14};;$/m)

    expect(advice).toContain('docs/rules/deployment.md')
    expect(readRepoSource('docs/rules/deployment.md')).toContain(
      `\n## ${match(advice, /'([^']+)'/)}\n`,
    )
  })

  // ⚠ A wrong `on:` block here fails silently, in both directions. `docs/testing.md` § "The merge
  // queue is the only gate that reads the tree a merge will produce" says how (#375).
  it('triggers on the pull request and the merge queue, and on no push', () => {
    expect(workflowEvents(ci)).toEqual(['merge_group', 'pull_request'])
  })

  // The guard is what refuses the `-design` playground's host. A publish step whose address
  // nothing checks is the silent green this whole lane exists to prevent.
  it('checks the published address against the app Worker', () => {
    expect(smoke).toContain('node scripts/assert-preview-host.mjs')

    const guard = readRepoSource('scripts/assert-preview-host.mjs')

    // The name comes off the config, never typed in: a rename has to break the guard rather
    // than leave it anchored on a Worker that no longer exists.
    expect(guard).toContain('appWorkerName()')
  })
})

// The browser lane is meant to be a REQUIRED check, and a required check fails silently in both
// directions: renamed, the ruleset waits on a check nothing posts any more; skipped or softened,
// it reports a green that refuses no merge. `docs/testing.md` § "The browser lane" says why it
// blocks.
describe('ci.yml browser lane', () => {
  const ci = readRepoSource('.github/workflows/ci.yml')
  const job = jobIn(ci, 'browser')
  const lane = steps(job).filter((step) => /^\s*run: pnpm test:browser$/m.test(step))

  it('posts the check name the ruleset records', () => {
    const name = match(job, /^ {4}name: (.+)$/m)

    expect(name).toBe('Browser lane')
    expect(
      match(readRepoSource('docs/testing.md'), /^\| Required status checks \|(.+)\|/m),
    ).toContain(`\`${name}\``)
  })

  it('runs on the pull request and in the merge queue alike, with nothing to skip it', () => {
    expect(workflowEvents(ci)).toEqual(['merge_group', 'pull_request'])
    expect(job).not.toMatch(/^ {4}if:/m)
    expect(lane).toHaveLength(1)
    expect(lane[0]).not.toMatch(/^\s*if:/m)
  })

  it('fails the workflow on the first failure, with no retry to hide a flake', () => {
    // The lane step runs a package script, so a flag there reaches CI as surely as one here.
    const runners = Object.values(readPackage().scripts).filter((script) =>
      /\bplaywright test\b/.test(script),
    )

    expect(job).not.toMatch(/continue-on-error/)
    expect(job).not.toMatch(/--retries/)
    expect(runners.length).toBeGreaterThan(0)
    for (const script of runners) expect(script).not.toMatch(/--retries/)
    expect(match(readRepoSource('playwright.config.ts'), /^\s*retries: (\S+),$/m)).toBe('0')
  })

  it('pins every action it uses by commit SHA', () => {
    const refs = [...job.matchAll(/^\s*(?:- )?uses: \S+@(\S+)/gm)].map((m) => m[1])

    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{40}$/)
  })

  // Every half fails silently: a key or path a character apart never hits, a save here writes an
  // entry only this run's own ref can read, and a hit that skips the system libraries leaves a
  // browser that cannot launch. `browser-cache.yml` says why.
  it('restores the browser `browser-cache.yml` saves, and saves none itself', () => {
    expectRestoresWarmedCache(job)
    expect(versionRead(job)).toBe(versionRead(warmWorkflow))
    expect(onCacheHit(job)).toMatch(/playwright install-deps chromium/)
  })
})

/**
 * The step a cache hit runs in place of the download. A restore brings the browser back and
 * nothing else — the system libraries it links against live outside the cached directory.
 */
const onCacheHit = (job: string) => {
  const hit = steps(job).filter((step) => /cache-hit == 'true'/.test(step))

  expect(hit, 'no step in this job runs on a cache hit').toHaveLength(1)

  return hit[0]
}

/**
 * Both `ci.yml` consumers read the one entry `browser-cache.yml` writes on `main`, and each half
 * fails silently: a key or path a character apart never hits, and a save in `ci.yml` writes an
 * entry no later ref can read (#459).
 */
const expectRestoresWarmedCache = (job: string) => {
  const cache = browserCache(job)

  expect(cacheActions(job)).toEqual(['actions/cache/restore'])
  expect(cache.keys).toHaveLength(1)
  expect(cache.paths).toHaveLength(1)
  expect(cache).toEqual(browserCache(warmWorkflow))
}

/** How a workflow names the browser cache: its keys, its paths. */
const browserCache = (workflow: string) => ({
  keys: [...new Set([...workflow.matchAll(/^\s*key: (.+)$/gm)].map((m) => m[1]))],
  paths: [...new Set([...workflow.matchAll(/^\s*path: (~\/.+)$/gm)].map((m) => m[1]))],
})

/**
 * The one-liner a workflow reads the key's version with. The gate reads the same version its own
 * way — out of `package.json`, validated — so only the lane and the warm job share this line.
 */
const versionRead = (workflow: string) => match(workflow, /^\s*run: (echo "version=.+)$/m)

describe('browser-cache.yml', () => {
  // The default branch is the one cache scope a pull request and a merge-queue run share.
  it('saves on main, the scope every consumer can restore from', () => {
    expect(workflowEvents(warmWorkflow)).toEqual(['push', 'workflow_dispatch'])
    expect(match(warmWorkflow, /^ {4}branches: (.+)$/m)).toBe('[main]')
    expect(cacheActions(warmWorkflow)).toEqual(['actions/cache/restore', 'actions/cache/save'])
  })

  // What makes the key's name true. The accessibility gate launches the headless shell, a
  // download of its own, so `--no-shell` here costs that gate the download this cache removes.
  it('saves the headless shell beside the full browser, as its key says', () => {
    const install = steps(warmWorkflow).filter((step) => /playwright install\b/.test(step))

    expect(install).toHaveLength(1)
    expect(match(install[0], /^\s*run: (.+playwright install.+)$/m)).not.toContain('--no-shell')
    expect(browserCache(warmWorkflow).keys[0]).toContain('with-shell')
  })

  it('pins every action it uses by commit SHA', () => {
    const refs = [...warmWorkflow.matchAll(/^\s*(?:- )?uses: \S+@(\S+)/gm)].map((m) => m[1])

    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref).toMatch(/^[0-9a-f]{40}$/)
  })
})

const gateJob = jobIn(readRepoSource('.github/workflows/ci.yml'), 'gate')

// The accessibility step is on the critical path of the one required check, and the merge queue
// pays it again per merge, so where its browser comes from is a cost the gate carries (#459).
describe("ci.yml's gate job, on the browser its accessibility step drives", () => {
  it('restores the browser `browser-cache.yml` saves, and saves none itself', () => {
    expectRestoresWarmedCache(gateJob)
  })

  // One step, on a hit as on a miss. An `if:` here would hand a partial or shell-less entry to
  // `pnpm test:a11y` as a browser, and `--with-deps` installs libraries no cache holds anyway.
  it('installs the browser and its system libraries whether the cache hit or missed', () => {
    const install = steps(gateJob).filter((step) => /playwright install\b/.test(step))

    expect(install).toHaveLength(1)
    expect(install[0]).toContain('--with-deps')
    expect(install[0]).not.toMatch(/^\s*if:/m)
  })

  // Two pins decide one key — the gate's own read and the warm job's — so a bump moving one
  // alone would key the gate on an entry nothing writes, and nothing but a download would say so.
  it('keys on a version both Playwright pins agree on', () => {
    const { devDependencies } = readPackage()

    expect(devDependencies.playwright).toBe(devDependencies['@playwright/test'])
  })
})

// The gate job runs the unit lane through the coverage script, so one step is both the lane and
// its measurement. Each way of getting that wrong is silent: a second step paying for the lane
// twice, a tolerance that lets a red spec through, or a summary reading a file nothing writes.
describe("ci.yml's gate job, on the unit lane", () => {
  it('runs the lane once, as the same vitest run the lean gate makes', () => {
    const { scripts } = readPackage()
    // ⚠ Which `pnpm test:*` steps are vitest is read off package.json, never listed here: the
    // accessibility gate is a step of this same job and drives a browser, not the lane. A
    // second vitest step still fails this, which is the whole point.
    const lanes = [...gateJob.matchAll(/^\s*(?:- )?run: (pnpm test\S*)/gm)]
      .map((m) => m[1])
      .filter((command) => scripts[command.replace(/^pnpm /, '')]?.includes('vitest'))

    expect(lanes).toEqual(['pnpm test:coverage'])
    expect(scripts['test:coverage']).toBe(`${scripts['test:run']} --coverage`)
  })

  // The step is the bare command: no `|| true` after it, and no key under it such as
  // `continue-on-error`, either of which would report a red spec as a green gate.
  it('lets a failing spec fail the job', () => {
    expect(gateJob).toMatch(/^ {6}- run: pnpm test:coverage\n(?! {8}\S)/m)
  })

  // The path is the `json-summary` reporter's own, under vitest's default reports directory.
  // Nothing else couples the two, and a summary step that finds no file only annotates.
  it('summarises the report the coverage config writes, into a directory git ignores', () => {
    const config = readRepoSource('vitest.config.ts')
    const [directory, file] = match(gateJob, /^\s*SUMMARY=(\S+)$/m).split('/')

    expect(file).toBe('coverage-summary.json')
    expect(config).toContain("'json-summary'")
    expect(config).not.toContain('reportsDirectory')
    expect(readRepoSource('.gitignore').split('\n')).toContain(directory)
  })

  // The step above is also the unit lane, so one threshold turns a coverage figure into a red
  // gate that no spec caused — and one set under today's figures does it on a later pull request.
  it('fails on no coverage figure', () => {
    expect(readRepoSource('vitest.config.ts')).not.toMatch(/['"]?thresholds['"]?\s*:/)
  })
})

// A tag is a name its owner can move, and a workflow that names one runs whatever the tag points
// at on the day — with this repository's secrets in reach. A commit SHA cannot move, so a new
// release arrives only as a pull request somebody reads (`.github/dependabot.yml` opens it).
describe('every workflow', () => {
  const DIR = '.github/workflows'
  const uses = readdirSync(join(REPO_ROOT, DIR))
    .filter((name) => /\.ya?ml$/.test(name))
    .flatMap((name) =>
      [
        ...readRepoSource(`${DIR}/${name}`).matchAll(
          /^[ \t]*(?:-[ \t]+)?uses:[ \t]*['"]?([^'"\s#]+)['"]?[ \t]*(#.*)?$/gm,
        ),
      ].map((m) => ({ file: name, ref: m[1], comment: m[2] ?? '' })),
    )

  // `sydevs/` is this organisation's own shared workflow, followed at `@main` on purpose, and a
  // `./` path is this repository at the commit under test. Everything else is somebody else's.
  const thirdParty = uses.filter(({ ref }) => !/^(sydevs\/|\.\/)/.test(ref))

  it('pins each third-party action by commit SHA, with its version beside it', () => {
    // A count of zero means the pattern above stopped matching, and every expectation below
    // would pass on nothing.
    expect(thirdParty.length).toBeGreaterThan(0)

    expect(thirdParty.filter(({ ref }) => !/@[0-9a-f]{40}$/.test(ref))).toEqual([])

    // The comment is the only readable half of a pin, and it is what Dependabot rewrites when it
    // moves the SHA — on the same line, or it is left behind.
    expect(thirdParty.filter(({ comment }) => !/^#\s*v\d/.test(comment))).toEqual([])
  })
})
