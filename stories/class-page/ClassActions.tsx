import type { ReactNode, ComponentProps } from 'react'
import type { Event } from '@/types'

import { useState } from 'react'
import { Globe, Phone, Share } from 'lucide-react'

import { ClassSharing } from './ClassSharing'

import { Button } from '@/components/atoms/Button'
import { Modal, ModalBody, ModalContent } from '@/components/atoms/Modal'
import { CopyField } from '@/components/molecules/ShareContent'
import { useCoarsePointer } from '@/config/responsive'
import { useWebShare } from '@/hooks/use-web-share'

export function ClassAction({
  label,
  icon,
  ...props
}: { label: string; icon: ReactNode } & ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className="h-auto min-h-11 min-w-0 flex-1 flex-col gap-1 rounded-lg bg-gray-3 px-2 py-2 text-xs font-medium text-foreground hover:bg-gray-4 pointer-coarse:h-auto [&_svg]:shrink-0 [&_svg]:text-primary"
      variant="ghost"
    >
      {icon}
      {label}
    </Button>
  )
}
export function ClassActions({
  event,
  url,
  inline = false,
}: {
  event: Event
  url?: string
  inline?: boolean
}) {
  const [panel, setPanel] = useState<'contact' | 'share' | null>(null)
  const touch = useCoarsePointer()
  const { share } = useWebShare()
  const canDial = touch || new URLSearchParams(location.search).get('device') === 'iPhone'

  return (
    <div
      className={
        inline
          ? 'flex gap-2 [&_a]:flex-row [&_a]:text-sm [&_button]:flex-row [&_button]:text-sm'
          : 'flex gap-2'
      }
    >
      {event.website && (
        <ClassAction
          href={event.website}
          icon={<Globe size={18} />}
          label="Website"
          target="_blank"
        />
      )}
      {event.contactPhone &&
        (canDial ? (
          <ClassAction href={'tel:' + event.contactPhone} icon={<Phone size={18} />} label="Call" />
        ) : (
          <ClassAction
            icon={<Phone size={18} />}
            label="Contact"
            onClick={() => setPanel('contact')}
          />
        ))}
      {!inline && url && (
        <ClassAction
          icon={<Share size={18} />}
          label="Share"
          onClick={async () => {
            if ((await share({ title: event.title, url })) === 'unavailable') setPanel('share')
          }}
        />
      )}
      <Modal
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null)
        }}
      >
        <ModalContent closeLabel="Close" title={panel === 'contact' ? 'Contact' : 'Share'}>
          <ModalBody className="pb-4">
            {panel === 'contact' && event.contactPhone ? (
              <>
                <p className="mb-2">{event.contactName}</p>
                <CopyField value={event.contactPhone} />
              </>
            ) : (
              url && <ClassSharing title={event.title} url={url} />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  )
}
