#!/usr/bin/env node

/**
 * The dependency-vulnerability gate.
 *
 *   node scripts/check-audit.mjs            # PR gate: fails on a NEW high or critical advisory
 *   node scripts/check-audit.mjs --strict   # scheduled run: also fails on a stale baseline entry
 *
 * ## The problem this solves
 *
 * CI had never run an audit before this gate. The lockfile accumulated 64
 * advisories: one critical, 24 high. Every gate stayed green the whole
 * time (`.claude/reports/RELEASE_READINESS.md` §3.6). The requirement is
 * not "zero advisories" — that is a separate dependency-update ticket,
 * #101 and #104. The requirement is that the next advisory cannot arrive
 * silently.
 *
 * ## Why a baseline, instead of a plain `--audit-level high`
 *
 * A bare threshold has two bad outcomes. It stays red today, blocking
 * every unrelated PR until the backlog clears. Or it sits so loose it
 * misses the thing it exists to catch. Neither is a real gate. So this
 * script pins the known findings in `audit-baseline.json`, each one named
 * with the ticket that owns it. The gate fires only on an advisory NOT in
 * that list. This keeps the check green today, and it turns red the day a
 * new advisory lands. That is the actual goal.
 *
 * The escape hatch stays small and reviewable on purpose. Add the GHSA id
 * to the baseline, with a one-line reason. That costs a commit, so it
 * becomes a decision someone made, rather than a warning nobody read.
 *
 * ## Where the ratchet lives
 *
 * A baseline entry that no longer appears in the audit is only a warning
 * here. A PR that *fixes* an advisory must not be punished for it, and
 * sibling dependency PRs can land at the same time. `--strict` (the
 * weekly `audit.yml` run) turns that warning into a failure. This way, the
 * list gets pruned somewhere that cannot block anyone's PR.
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
 * Runs the audit command and parses its output.
 *
 * `pnpm audit` exits non-zero whenever it finds anything. A throw is
 * therefore the normal path, and the JSON this function wants sits on the
 * error's stdout. This function returns `null` when no usable report
 * comes back. The caller then reports "unavailable", a different failure
 * from "found something".
 *
 * "Usable" is the key word here. A registry failure does not produce
 * unparseable output. pnpm still emits well-formed JSON, shaped like
 * `{"error":{"code":"ENOTFOUND","message":…}}`. That JSON parses cleanly.
 * It carries no `advisories` field and no `metadata` field. Downstream
 * code would then read it as a clean tree with nothing to report — a
 * green gate on an audit that never ran.
 *
 * A non-empty baseline used to mask this failure. Zero findings against a
 * 27-entry baseline tripped the guard below on its own. Emptying the
 * baseline in #101 exposed the gap. So this function rejects both the
 * error envelope and a missing `metadata` field, at the one place that
 * already knows how to report "unavailable".
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
 * Describes whatever `pnpm.auditConfig` is suppressing, for the
 * annotation. Returns `null` when nothing is suppressed.
 *
 * pnpm drops the ignored ids from `advisories`, but it leaves
 * `metadata.vulnerabilities` alone. A suppressed advisory is therefore not
 * strictly invisible — the totals and the list disagree. That disagreement
 * is not a usable signal here, though. The totals count findings, while
 * this file counts DISTINCT ids, so the two already disagree for a
 * legitimate reason (see the `gated` comment below). Reading the config
 * directly gives the exact signal, instead of an approximation of it.
 *
 * This function is tied to the pinned `packageManager` version, pnpm 9.
 * pnpm 10 also accepts these settings from `pnpm-workspace.yaml`. A major
 * version bump needs this function widened to match, or the check goes
 * quietly blind.
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
 * Appends the table of advisories that are NOT in the baseline, if there
 * are any.
 *
 * Both the normal path and the blind-run path share this function. A run
 * that cannot be trusted as clean must still print what it did manage to
 * see. Otherwise the warning would replace the finding, instead of
 * standing beside it.
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
    // Unavailable is not the same as clean. This never turns an unrelated
    // PR red. But the weekly run treats it as a failure, so a permanently
    // broken check cannot masquerade as a passing one.
    process.exit(strict ? 1 : 0)
  }

  const counts = audit.metadata?.vulnerabilities || {}
  const found = Object.values(audit.advisories || {})
  const idOf = (a) => a.github_advisory_id || `npm-${a.id}`

  // This map is keyed by advisory id, not by advisory record. pnpm reports
  // one entry per (advisory, package) pair. A single GHSA affecting two
  // packages would otherwise make the printed count disagree with the
  // number of lines in the baseline.
  const gated = new Map(found.filter((a) => GATED.includes(a.severity)).map((a) => [idOf(a), a]))
  const fresh = [...gated.entries()].filter(([id]) => !(id in known)).map(([, a]) => a)
  const stale = Object.keys(known).filter((id) => !gated.has(id))

  // A quiet report can be a lie in three ways.
  //
  // The baseline used to catch the first way on its own: zero advisories
  // against a non-empty list. Issue #101 fixed all 27 entries and emptied
  // the baseline, so that tell no longer fires. The other two ways now
  // need an explicit check.
  //
  // Each check below must be exact about what it catches. A guard that
  // looks broader than it really is stops people from looking for the
  // real problem. That makes it worse than no guard at all.
  //
  //  - `pnpm.auditConfig` (`ignoreGhsas` or `ignoreCves`) drops advisories
  //    at the SOURCE, before this file ever sees them. Now that the
  //    baseline is empty, this setting is the only remaining way to hide a
  //    finding. Unlike a baseline line, it records no owner and no ticket.
  //    Its mere presence is the failure, not something to go inspect. That
  //    is why it turns a PR red, instead of only warning like the other
  //    two checks. It is also a repo-authored change, visible in the diff
  //    of whoever added it — a registry outage is nobody's PR.
  //  - `totalDependencies === 0` means the audit walked no packages. This
  //    points to a wrong working directory, or an empty lockfile. The
  //    check is narrow and cheap. A registry outage does NOT trigger this
  //    check — `runAudit` already rejects that error envelope, and routes
  //    it to the "unavailable" branch above.
  //  - Zero advisories against a NON-EMPTY baseline. This check is vacuous
  //    while the baseline stays empty. It stays here for when the
  //    baseline refills.
  //
  // This script skips an ABSENT `totalDependencies`, rather than failing
  // on it. An older pnpm version that does not report the count is not
  // evidence of a blind run. This code exists to catch silence, not to
  // invent it.
  //
  // Whatever the reason, a blind run must still print what it did see.
  // The new-advisory table gets printed, and its exit code gets
  // respected, before anything else runs. Otherwise a single suppression
  // entry would turn every unrelated finding green at once.
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
