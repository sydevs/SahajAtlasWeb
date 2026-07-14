/**
 * Sparse-relation merge for live preview (issue #40), ported from WeMeditateWeb's
 * `mergePreviewData`.
 *
 * The PayloadCMS live-preview message stream resends the whole edited doc on every
 * keystroke but can collapse a populated relationship (`region`, an image) back to its
 * bare ID. Overlaying such a message directly would blow away the populated object the
 * initial fetch resolved. This merge keeps the last-known-good populated object
 * whenever the incoming value is only its ID, while letting every genuine edit — a
 * changed scalar, a changed/removed relation, an explicit `null` — flow through.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
  )
}

function isRelationReference(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number'
}

function isPopulatedRelation(value: unknown): value is { id: string | number } {
  return isPlainObject(value) && 'id' in value && isRelationReference(value.id)
}

function mergeRecursive(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
  depth: number,
  maxDepth: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }

  for (const key of Object.keys(overlay)) {
    const overlayValue = overlay[key]
    const baseValue = base[key]

    // `undefined` never clears — an omitted key keeps the base value.
    if (overlayValue === undefined) continue

    // Keep the populated relationship object when the live message sent only its ID.
    if (
      isPopulatedRelation(baseValue) &&
      isRelationReference(overlayValue) &&
      baseValue.id === overlayValue
    ) {
      result[key] = baseValue
      continue
    }

    if (isPlainObject(baseValue) && isPlainObject(overlayValue) && depth < maxDepth) {
      result[key] = mergeRecursive(baseValue, overlayValue, depth + 1, maxDepth)
      continue
    }

    // Real change wins: a changed scalar, a new/changed relation id, or an explicit
    // null. (A relation whose id genuinely changed flows through as the new id, which
    // the live-preview hook then re-populates.)
    result[key] = overlayValue
  }

  return result
}

/**
 * Merge an incoming live-preview `overlay` onto the last-known-good `base`. Returns
 * `base` unchanged when there's no overlay; otherwise a new object (never mutates
 * either input). `maxDepth` bounds recursion into nested groups.
 */
export function mergePreviewData<T>(base: T, overlay: T | null | undefined, maxDepth = 3): T {
  if (!overlay) return base
  if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay ?? base

  return mergeRecursive(
    base as Record<string, unknown>,
    overlay as Record<string, unknown>,
    0,
    maxDepth,
  ) as T
}
