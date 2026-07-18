// A scrollable list wrapper. The surrounding Panel is the actual scroll
// container (`md:overflow-y-scroll`), so this is a plain styled `<ul>` — the
// NextUI ScrollShadow it replaced couldn't show edge fades in this layout
// (the `<ul>` never scrolls), so no shadow machinery is carried over.
//
// `divide-y` draws the divider BETWEEN cards (not after the last one) — cards
// themselves carry no bottom border, so mixed region/event lists stay uniform.
export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="scroll-p-0 scroll-m-0 divide-y divide-divider overflow-y-auto">{children}</ul>
  )
}
