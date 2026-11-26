/** Whether these platform facts name iOS. iPadOS reports a Mac, and tells itself apart by touch. */
export function isIOSPlatform(platform: string, maxTouchPoints: number) {
  return /^iP(hone|ad|od)/.test(platform) || (platform === 'MacIntel' && maxTouchPoints > 1)
}

/**
 * iOS: the sheet's Safari workarounds, and Apple Maps for directions.
 *
 * ⚠ `navigator.platform` is deprecated and still the only reliable answer: the user-agent string
 * says Mac OS X on an iPad, and `userAgentData` carries no iOS brand. vaul reads the same field
 * for its own platform checks and exports none of them.
 */
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  isIOSPlatform(navigator.platform ?? '', navigator.maxTouchPoints ?? 0)
