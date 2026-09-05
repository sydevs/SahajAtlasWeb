#!/usr/bin/env node

/**
 * The dependency-vulnerability gate.
 *
 *   node scripts/check-audit.mjs            # PR gate: fail on a NEW high/critical
 *   node scripts/check-audit.mjs --strict   # scheduled: also fail on a stale baseline
 *
 * ## The problem this solves
 *
 * Nothing in CI had ever run an audit, so the lockfile accumulated 64
 * advisories — one critical, 24 high — with every gate green the whole way
 * (`.claude/reports/RELEASE_READINESS.md` §3.6). The requirement is not "have
 * zero advisories" (that is a dependency-update ticket, #101/#104). It is that
 * the NEXT one cannot arrive silently.
 *
 * ## Why a baseline instead of a plain `--audit-level high`
 *
 * A bare threshold has to be either red today — blocking every unrelated PR
 * until the backlog clears — or set so loose it would miss the thing it
 * exists to catch. Neither is a gate. So the known findings are pinned in
 * `audit-baseline.json`, each named with the ticket that owns it, and the
 * gate fires on anything NOT in that list. That makes the check green today
 * and red the day a new advisory lands, which is the actual goal.
 *
 * The escape hatch is deliberately small and reviewable: add the GHSA id to
 * the baseline with a one-line reason. It costs a commit, so it becomes a
 * decision someone made, rather than a warning nobody read.
 *
 * ## Where the ratchet lives
 *
 * Baseline entries that no longer appear are only a warning here — a PR that
 * *fixes* an advisory must not be punished for it, and sibling dependency PRs
 * land concurrently. `--strict` (the weekly `audit.yml`) turns that into a
 * failure, so the list gets pruned somewhere it cannot block anyone's PR.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { annotate, report } from './_ci-output.mjs'

/** The severities that fail the gate. Moderate and low are reported by the weekly run only. */
const GATED = ['critical', 'high']

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = resolve(import.meta.dirname, 'audit-baseline.json')

const strict = process.argv.slice(2).includes('--strict')

/**
 * Runs the audit and parses it.
 *
 * `pnpm audit` exits non-zero whenever it finds anything, so a throw is the
 * normal path, and the JSON we want is on the error's stdout. This returns
 * null when no USABLE report came back — reported as "unavailable", which is
 * a different failure from "found something".
 *
 * "Usable" is the load-bearing word. A registry failure does not produce
 * unparseable output: pnpm emits well-formed JSON of the shape
 * `{"error":{"code":"ENOTFOUND","message":…}}`. That parses, has no
 * `advisories` and no `metadata`, and so reads downstream as a clean tree
 * with nothing to report — a green gate on an audit that never ran. It was
 * masked while the baseline was non-empty (zero findings against a
 * 27-entry list tripped the guard below). Emptying the baseline in #101
 * exposed it. So both the error envelope and a missing `metadata` are
 * rejected here, at the one place that already knows how to say
 * "unavailable".
 */
function runAudit() {
  let stdout = ''

  try {
    stdout = execFileSync('pnpm', ['audit', '--prod', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    stdout = /** @type {{ stdout?: string }} */ (err)?.stdout || ''
  }

  try {
    const parsed = JSON.parse(stdout)

    if (!parsed || typeof parsed !== 'object' || parsed.error || !parsed.metadata) return null

    return parsed
  } catch {
    return null
  }
}

/**
 * Describes whatever `pnpm.auditConfig` is suppressing, for the annotation —
 * or returns null when nothing is.
 *
 * pnpm drops the ignored ids from `advisories` but leaves
 * `metadata.vulnerabilities` alone, so a suppressed advisory is not strictly
 * invisible — the totals and the list disagree. That skew is not a usable
 * signal here, though: the totals count findings, while this file counts
 * DISTINCT ids, so the two legitimately disagree already (see the `gated`
 * comment below). Reading the config is the exact signal, rather than an
 * approximation of it.
 *
 * Tied to the pinned `packageManager` (pnpm 9): pnpm 10 also accepts these
 * settings from `pnpm-workspace.yaml`, so a major bump needs this widened,
 * or the check goes quietly blind.
 */
function auditSuppression() {
  let config

  try {
    config = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).pnpm?.auditConfig
  } catch {
    return null
  }

  const list = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  const ignored = [...list(config?.ignoreGhsas), ...list(config?.ignoreCves)]

  return ignored.length ? ignored.join(', ') : null
}

/**
 * Appends the table of advisories that are NOT in the baseline, if any.
 *
 * Shared by the normal path and the blind-run path: a run that could not be
 * trusted as clean still has to print what it did manage to see, or the
 * warning replaces the finding instead of accompanying it.
 */
function reportFresh(lines, fresh, idOf) {
  if (!fresh.length) return

  lines.push('| Severity | Package | Advisory | Fix |', '| --- | --- | --- | --- |')

  for (const a of fresh) {
    const fix = a.patched_versions && a.patched_versions !== '<0.0.0' ? a.patched_versions : '—'

    lines.push(
      `| ${a.severity} | \`${a.module_name}\` | [${idOf(a)}](${a.url}) ${a.title} | \`${fix}\` |`,
    )
  }

  lines.push('')
}

function main() {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  const known = baseline.advisories || {}
  const audit = runAudit()
  const lines = ['### Dependency audit (`pnpm audit --prod`)', '']

  if (!audit) {
    const message =
      'Dependency audit produced no parseable output — the registry may be ' +
      'unreachable, or pnpm changed its JSON shape. No advisories were checked.'

    lines.push(`⚠️ ${message}`)
    annotate('warning', message)
    report(lines)
    // Unavailable is not the same as clean. It never reds an unrelated PR,
    // but the weekly run treats it as a failure, so a permanently broken
    // check cannot masquerade as a passing one.
    process.exit(strict ? 1 : 0)
  }

  const counts = audit.metadata?.vulnerabilities || {}
  const found = Object.values(audit.advisories || {})
  const idOf = (a) => a.github_advisory_id || `npm-${a.id}`

  // Keyed by advisory id, not by advisory record: pnpm reports one entry per
  // (advisory, package), so a single GHSA affecting two packages would
  // otherwise make the printed count disagree with the number of lines in
  // the baseline.
  const gated = new Map(found.filter((a) => GATED.includes(a.severity)).map((a) => [idOf(a), a]))
  const fresh = [...gated.entries()].filter(([id]) => !(id in known)).map(([, a]) => a)
  const stale = Object.keys(known).filter((id) => !gated.has(id))

  // There are three ways a quiet report can be a lie. The baseline used to
  // catch the first of them on its own — zero advisories against a
  // non-empty list — and issue #101 fixed all 27 entries and emptied it, so
  // that tell no longer fires and the others have to be named explicitly.
  //
  // Be exact about what each one reaches. A guard that reads as broader
  // cover than it gives is worse than no guard, because it stops anyone
  // looking for the real one:
  //
  //  - `pnpm.auditConfig` (`ignoreGhsas` / `ignoreCves`) drops advisories at
  //    the SOURCE, before this file sees them. Now that the baseline is
  //    empty, it is the only remaining way to hide a finding, and unlike a
  //    baseline line it records no owner and no ticket. Its presence is
  //    therefore the failure, not a thing to go and inspect — which is why
  //    it reds a PR rather than warning like the other two. It is a
  //    repo-authored change, visible in the diff of whoever added it. A
  //    registry outage is not anybody's PR.
  //  - `totalDependencies === 0` means the audit walked no packages: a
  //    wrong working directory, or a lockfile with nothing in it. Narrow
  //    and cheap. A registry outage is NOT this case — its error envelope
  //    is rejected by `runAudit`, which routes it to the "unavailable"
  //    branch above.
  //  - Zero advisories against a NON-EMPTY baseline. Vacuous while the
  //    list is empty. Kept for when it refills.
  //
  // An ABSENT `totalDependencies` is skipped, rather than failed: an older
  // pnpm not reporting the count is not evidence of a blind run, and this
  // exists to catch silence, not to invent it.
  //
  // Whatever the reason, a blind run must not also SWALLOW what it did see:
  // the new-advisory table is printed and its exit code respected first, or
  // a single suppression entry would turn every unrelated finding green at
  // once.
  const suppression = auditSuppression()
  const audited = audit.metadata?.totalDependencies
  const blindReason = suppression
    ? `\`pnpm.auditConfig\` suppresses advisories at the source (${suppression}). ` +
      'Waivers belong in scripts/audit-baseline.json, which names the ticket that owns each one.'
    : audited === 0
      ? 'it walked zero packages — a wrong working directory or an empty lockfile.'
      : !found.length && Object.keys(known).length
        ? `it found nothing while the baseline lists ${Object.keys(known).length}.`
        : null

  if (blindReason) {
    const message = `Dependency audit is not looking, not clean: ${blindReason} Check \`pnpm audit --prod\` by hand.`

    lines.push(`⚠️ ${message}`, '')
    reportFresh(lines, fresh, idOf)
    annotate(strict || suppression ? 'error' : 'warning', message)
    report(lines)
    process.exit(strict || suppression || fresh.length ? 1 : 0)
  }

  lines.push(
    `${found.length} advisories in production dependencies — ` +
      `**${counts.critical || 0} critical, ${counts.high || 0} high**, ` +
      `${counts.moderate || 0} moderate, ${counts.low || 0} low.`,
    '',
    `${gated.size} distinct advisories at or above **high**; ` +
      `**new (not in \`scripts/audit-baseline.json\`): ${fresh.length}**.`,
    '',
  )

  reportFresh(lines, fresh, idOf)

  if (stale.length) {
    lines.push(
      `Fixed since the baseline was written, remove from ` +
        `\`scripts/audit-baseline.json\` (${stale.length}): ` +
        `${stale.map((id) => `\`${id}\``).join(', ')}`,
      '',
    )
  }

  report(lines)

  if (fresh.length) {
    const message =
      `New high/critical advisories (${fresh.length}): ` +
      `${fresh.map((a) => `${idOf(a)} (${a.module_name})`).join(', ')}. ` +
      'Update the dependency, or — if it cannot be fixed now — add the id to ' +
      'scripts/audit-baseline.json with the ticket that owns it.'

    annotate('error', message)
    process.exit(1)
  }

  if (stale.length && strict) {
    annotate(
      'error',
      `Stale audit baseline: ${stale.join(', ')} no longer reported — prune from ` +
        'scripts/audit-baseline.json.',
    )
    process.exit(1)
  }

  if (stale.length) {
    annotate('notice', `Audit baseline has ${stale.length} fixed entries — safe to prune.`)
  }

  annotate('notice', `Dependency audit: no new high/critical advisories (${gated.size} known).`)
}

main()
