export function MobileFooterFade() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-full h-4"
      style={{
        backgroundImage:
          'linear-gradient(to bottom, hsl(var(--background) / 0), hsl(var(--background) / 0.6) 64%, hsl(var(--background)))',
      }}
    />
  )
}
