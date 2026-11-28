// One share target: its disc above its name, the whole column one button. react-share's own inline
// reset is off (`resetButtonStyle`): it squared the corners and set the font, colour and outline
// offset. Shared by the networks and Copy link.
export const TARGET_CLASS =
  'focus-ring flex w-[72px] cursor-pointer flex-col items-center gap-1 rounded-lg text-xs text-gray-11'

// The share row's look beside the inline map: a quarter of the row each, a 48px disc, and the
// name in the page's own type, since there the targets are the content rather than a menu.
export const ROW_TARGET_CLASS =
  'focus-ring flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-lg py-1 text-sm font-medium text-foreground'
