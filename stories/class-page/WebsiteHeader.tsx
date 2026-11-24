import raleway from '@fontsource-variable/raleway/files/raleway-latin-wght-normal.woff2?url'
import { ChevronDown, MapPin, Menu } from 'lucide-react'

import lotus from './host-lotus.svg'

const menu = ['Meditate Now', 'Music for Meditation', 'Inspiration', 'About Meditation']

export function WebsiteHeader() {
  return (
    <header
      aria-label="We Meditate website header"
      className="@container sticky top-0 z-30 h-[var(--class-host-header-height)] shrink-0 border-b border-[#e5e7eb] bg-white text-[#374151]"
      style={{ fontFamily: 'WeMeditateHeader, sans-serif' }}
    >
      <style>{`@font-face{font-family:WeMeditateHeader;src:url("${raleway}") format("woff2");font-weight:100 900;font-display:swap}`}</style>
      <div className="mx-auto flex h-full max-w-[1280px] items-center gap-2 px-6 @min-[1024px]:grid @min-[1024px]:grid-cols-[1fr_auto_1fr]">
        <span className="me-auto inline-flex shrink-0 items-center gap-2.5 text-lg font-normal whitespace-nowrap">
          <img alt="" className="size-7" src={lotus} />
          We meditate
        </span>
        <div className="hidden items-stretch gap-2 @min-[1024px]:flex">
          {menu.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 px-6 py-2 text-sm font-medium whitespace-nowrap"
            >
              {label}
              {label === 'About Meditation' && <ChevronDown aria-hidden size={16} />}
            </span>
          ))}
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 justify-self-end text-sm font-medium">
          <MapPin aria-label="Classes Near Me" size={20} strokeWidth={1.5} />
          <span className="hidden @min-[1280px]:inline">Classes Near Me</span>
          <span className="-me-2.5 grid size-10 place-items-center @min-[1024px]:hidden">
            <Menu aria-label="Menu" size={20} strokeWidth={1.5} />
          </span>
        </span>
      </div>
    </header>
  )
}
