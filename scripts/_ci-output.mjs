/**
 * Reporting helpers shared by the CI gate scripts (`check-audit.mjs`,
 * `check-bundle-size.mjs`).
 *
 * Both write the same two kinds of output, and the point of sharing them is
 * that both gates surface a failure the same way. The first draft
 * copy-pasted this and immediately drifted: the audit gate raised an
 * annotation on failure, while the size gate only wrote to stderr, so one
 * breach was visible on the run and the other was only findable by
 * unfolding the log.
 *
 * This is underscore-prefixed, so it reads as a helper rather than a
 * runnable script, the same convention `tests/smoke/_helpers/` uses.
 */

import { appendFileSync } from 'node:fs'

/**
 * Prints a markdown report and, in Actions, adds it to the job summary.
 * @param {string[]} lines
 */
export function report(lines) {
  const text = lines.join('\n')

  // Actions parses stdout for `::command::` lines, and some of what we
  // print is registry-sourced (advisory titles). This defangs a line that
  // starts with `::`, so a hostile or merely unlucky title cannot forge a
  // workflow command.
  console.log(text.replace(/^::/gm, '​::'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
}

/**
 * Emits a GitHub Actions annotation — surfaced on the run itself, so the
 * reason a gate failed does not depend on anyone expanding the log. Outside
 * Actions it is still a readable line, so local runs lose nothing.
 * @param {'error' | 'warning' | 'notice'} level
 * @param {string} message
 */
export function annotate(level, message) {
  // Annotations are single-line, and `%`, CR, and LF are the command
  // format's own escapes — left raw, a message containing one is truncated
  // or mangled, with the remainder spilling out as stray log output.
  const escaped = message
    .replace(/\s*\n\s*/g, ' ')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')

  console.log(`::${level}::${escaped}`)
}
