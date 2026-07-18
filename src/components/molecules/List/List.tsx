// A scrollable list wrapper. The surrounding Panel is the actual scroll
// container (`md:overflow-y-scroll`), so this is a plain styled `<ul>` — the
// NextUI ScrollShadow it replaced couldn't show edge fades in this layout
// (the `<ul>` never scrolls), so no shadow machinery is carried over.
//
// The divider is drawn here (cards carry no border of their own, so mixed
// region/event lists stay uniform) as a ::before rule on every child EXCEPT the
// first — so it separates cards without trailing after the last. It's inset to
// `inset-x-6`, matching the cards' own `px-6`, so the line stops short of the
// edges exactly as the per-card border it replaced did, while each card's hover
// background still bleeds the full width.
const DIVIDER =
  "[&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-6 [&>*+*]:before:top-0 [&>*+*]:before:border-t [&>*+*]:before:border-divider [&>*+*]:before:content-['']"

export function List({ children }: { children: React.ReactNode }) {
  return <ul className={`scroll-p-0 scroll-m-0 overflow-y-auto ${DIVIDER}`}>{children}</ul>
}
