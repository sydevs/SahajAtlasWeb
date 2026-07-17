import type { Story } from '@ladle/react'

import { ActionCircle, ActionRow } from './ActionRow'

import { CalendarIcon, CallIcon, DirectionsIcon, ShareIcon } from '@/components/atoms/Icons'

// The physical-live action set: Directions · Add to calendar · Contact · Share.
export const PhysicalLive: Story = () => (
  <ActionRow className="max-w-md">
    <ActionCircle
      external
      href="https://maps.example"
      icon={<DirectionsIcon />}
      label="Directions"
    />
    <ActionCircle icon={<CalendarIcon />} label="Add to calendar" onClick={() => {}} />
    <ActionCircle href="tel:+441234567890" icon={<CallIcon />} label="Contact" />
    <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
  </ActionRow>
)

// Inactive event: no Register exists, so Contact is the emphasized action.
export const InactiveEmphasizedContact: Story = () => (
  <ActionRow className="max-w-md">
    <ActionCircle emphasized href="tel:+441234567890" icon={<CallIcon />} label="Contact" />
    <ActionCircle
      external
      href="https://maps.example"
      icon={<DirectionsIcon />}
      label="Directions"
    />
    <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
  </ActionRow>
)

// Narrow container: the row scrolls horizontally with an edge fade.
export const OverflowScroll: Story = () => (
  <div className="w-52 border border-divider p-2">
    <ActionRow>
      <ActionCircle
        external
        href="https://maps.example"
        icon={<DirectionsIcon />}
        label="Directions"
      />
      <ActionCircle icon={<CalendarIcon />} label="Add to calendar" onClick={() => {}} />
      <ActionCircle href="tel:+441234567890" icon={<CallIcon />} label="Contact" />
      <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
    </ActionRow>
  </div>
)

// Two-line label budget: long i18n labels clamp at two lines, then ellipsis.
export const LongLabels: Story = () => (
  <ActionRow className="max-w-md">
    <ActionCircle icon={<CalendarIcon />} label="Añadir al calendario" onClick={() => {}} />
    <ActionCircle
      href="tel:+4912345"
      icon={<CallIcon />}
      label="Kontaktaufnahme mit dem Gastgeber"
    />
    <ActionCircle icon={<ShareIcon size={20} />} label="Share" onClick={() => {}} />
  </ActionRow>
)
