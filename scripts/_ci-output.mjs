/**
 * Reporting helpers shared by the CI gate scripts (`check-audit.mjs`,
 * `check-bundle-size.mjs`).
 *
 * Both scripts write the same two kinds of output. This keeps both gates
 * consistent when they report a failure. An early draft copied this code
 * instead of sharing it, and the two gates drifted apart: the audit gate
 * raised an annotation on failure, while the size gate only wrote to
 * stderr. A reader could see the audit failure on the run itself, but the
 * size failure stayed hidden until someone opened the log.
 *
 * The underscore prefix marks this file as a helper, not a runnable
 * script. `tests/smoke/_helpers/` uses the same convention.
 */

import { appendFileSync } from 'node:fs'

/**
 * Prints a markdown report and, in Actions, adds it to the job summary.
 * @param {string[]} lines
 */
export function report(lines) {
  const text = lines.join('\n')

  // GitHub Actions parses stdout for `::command::` lines. Some printed text
  // comes from the registry, such as advisory titles. This defangs any
  // line that starts with `::`, so a hostile or unlucky title cannot forge
  // a workflow command.
  console.log(text.replace(/^::/gm, '​::'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  }
}

/**
 * Emits a GitHub Actions annotation. The annotation appears on the run
 * itself, so a reader does not need to expand the log to see why a gate
 * failed. Outside Actions, this still prints a readable line, so local
 * runs lose no information.
 * @param {'error' | 'warning' | 'notice'} level
 * @param {string} message
 */
export function annotate(level, message) {
  // Annotations are single-line. The command format reserves `%`, CR, and
  // LF as its own escape characters. A raw message containing one of these
  // gets truncated or mangled, and the remaining text spills out as stray
  // log output.
  const escaped = message
    .replace(/\s*\n\s*/g, ' ')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')

  console.log(`::${level}::${escaped}`)
}
