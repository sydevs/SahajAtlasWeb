/**
 * Marks a loading placeholder. The phone sheet's fit (`useFitSnap`) holds its stop while one is in
 * the body, so the sheet moves once, when the content arrives. A leaf of its own, so the eager
 * boot panel can stamp it without carrying the hook.
 */
export const LOADING_ATTR = 'data-sy-loading'

/** Spread onto the element that wraps a placeholder. */
export const LOADING = { [LOADING_ATTR]: '' }
