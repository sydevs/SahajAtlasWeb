import { useSuspenseQuery } from '@tanstack/react-query'

import { clientQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'

function ReadClient({ apiKey }: { apiKey: string }) {
  useSuspenseQuery(clientQuery(apiKey))

  return null
}

/**
 * Holds the content beside it back until the client record has loaded, by suspending to the
 * nearest boundary, and throws to that boundary when the record can't be read.
 *
 * Which boundary is the point. In the map form this sits INSIDE the drawer, so a slow or failed
 * API shows in the sheet with the map still on screen. In the compact and map-less forms it sits
 * at the top of the shell, because there is no map to keep.
 */
export function ClientGate() {
  const { apiKey } = useWidgetMode()

  return apiKey ? <ReadClient apiKey={apiKey} /> : null
}
