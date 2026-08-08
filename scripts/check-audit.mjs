#!/usr/bin/env node

/**
 * Dependency-vulnerability gate.
 *
 *   node scripts/check-audit.mjs            # PR gate: fail on a NEW high/critical
 *   node scripts/check-audit.mjs --strict   # scheduled: also fail on a stale baseline
 *
 * ## The problem this solves
 *
 * Nothing in CI had ever run an audit, so the lockfile accumulated 64 advisories
 * — one critical, 24 high — with every gate green the whole way
 * (`.claude/reports/RELEASE_READINESS.md` §3.6). The requirement is not "have
 * zero advisories" (that is a dependency-update ticket, #101/#104); it is that
 * the NEXT one cannot arrive silently.
 *
 * ## Why a baseline instead of a plain `--audit-level high`
 *
 * A bare threshold has to be either red today — blocking every unrelated PR
 * until the backlog clears — or set so loose it would miss the thing it exists
 * to catch. Neither is a gate. So the known findings are pinned in
 * `audit-baseline.json`, each named with the ticket that owns it, and the gate
 * fires on anything NOT in that list. That makes the check green today and red
 * the day a new advisory lands, which is the actual goal.
 *
 * The escape hatch is deliberately small and reviewable: add the GHSA id to the
 * baseline with a one-line reason. It costs a commit, so it is a decision
 * someone made rather than a warning nobody read.
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

/** Severities that fail the gate. Moderate/low are reported by the weekly run only. */
const GATED = ['critical', 'high']

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = resolve(import.meta.dirname, 'audit-baseline.json')

const strict = process.argv.slice(2).includes('--strict')

/**
 * Run the audit and parse it.
 *
 * `pnpm audit` exits non-zero whenever it finds anything, so a throw is the
 * normal path and the JSON we want is on the error's stdout. Returns null when
 * no JSON came back at all — a registry outage or a pnpm change, which is a
 * different failure from "found something" and is reported as such.
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

    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/**
 * Whatever `pnpm.auditConfig` is suppressing, described for the annotation —
 * or null when nothing is.
 *
 * This is the one suppression channel the report itself cannot expose: pnpm
 * filters the ignored ids out before writing the JSON, so a silenced advisory
 * is indistinguishable from an absent one. Reading the config directly is the
 * only way to see it, which is why the check lives here rather than keying off
 * anything in the audit output.
 */
function auditSuppression() {
  let config

  try {
    config = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).pnpm?.auditConfig
  } catch {
    return null
  }

  const ignored = [...(config?.ignoreGhsas || []), ...(config?.ignoreCves || [])]

  return ignored.length ? ignored.join(', ') : null
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
    // Unavailable is not the same as clean. It never reds an unrelated PR, but
    // the weekly run treats it as a failure so a permanently broken check can't
    // masquerade as a passing one.
    process.exit(strict ? 1 : 0)
  }

  const counts = audit.metadata?.vulnerabilities || {}
  const found = Object.values(audit.advisories || {})
  const idOf = (a) => a.github_advisory_id || `npm-${a.id}`

  // Keyed by advisory id, not by advisory record: pnpm reports one entry per
  // (advisory, package), so a single GHSA affecting two packages would otherwise
  // make the printed count disagree with the number of lines in the baseline.
  const gated = new Map(found.filter((a) => GATED.includes(a.severity)).map((a) => [idOf(a), a]))
  const fresh = [...gated.entries()].filter(([id]) => !(id in known)).map(([, a]) => a)
  const stale = Object.keys(known).filter((id) => !gated.has(id))

  // Three ways a quiet report can be a lie. The baseline used to catch the first
  // of them on its own — zero advisories against a non-empty list — and issue
  // #101 fixed all 27 entries and emptied it, so that tell no longer fires and
  // the others have to be named explicitly.
  //
  // Be exact about what each one reaches. A guard that reads as broader cover
  // than it gives is worse than no guard, because it stops anyone looking for the
  // real one:
  //
  //  - `pnpm.auditConfig` (`ignoreGhsas` / `ignoreCves`) drops advisories at the
  //    SOURCE. It changes neither the graph nor the report's totals, so nothing
  //    else in this file can see it — the run simply comes back quieter. Now that
  //    the baseline is empty it is the only remaining way to hide a finding, and
  //    unlike a baseline line it records no owner and no reason. Its presence is
  //    therefore the failure, not a thing to inspect.
  //  - `totalDependencies === 0` means the audit walked no packages: a wrong
  //    working directory, or a lockfile with nothing in it. Narrow and cheap.
  //    A registry outage is NOT this case — unparseable output is caught above.
  //  - Zero advisories against a NON-EMPTY baseline. Vacuous while the list is
  //    empty; kept for when it refills.
  //
  // An ABSENT `totalDependencies` is skipped rather than failed: an older pnpm
  // not reporting the count is not evidence of a blind run, and this exists to
  // catch silence, not to invent it.
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

    lines.push(`⚠️ ${message}`)
    annotate(strict ? 'error' : 'warning', message)
    report(lines)
    process.exit(strict ? 1 : 0)
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

  if (fresh.length) {
    lines.push('| Severity | Package | Advisory | Fix |', '| --- | --- | --- | --- |')
    for (const a of fresh) {
      const fix = a.patched_versions && a.patched_versions !== '<0.0.0' ? a.patched_versions : '—'

      lines.push(
        `| ${a.severity} | \`${a.module_name}\` | [${idOf(a)}](${a.url}) ${a.title} | \`${fix}\` |`,
      )
    }
    lines.push('')
  }

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
