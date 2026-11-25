import { Skeleton, SkeletonBlock, SkeletonLine } from '@/components/atoms/Skeleton'

/**
 * `MapSearch` before it can mount: the geocoder's box at the geocoder's size, but greyed and
 * holding bars, so it reads as on its way rather than as a field that ignores a tap. The real
 * field is a Mapbox custom element bound to the live map and the client record, so a loading
 * header would otherwise build one and throw it away the moment its view arrives.
 *
 * The numbers are the geocoder's as rendered with `controlTheme`: a 1px border round a 36px
 * input (44px on a touch screen), the glyph 8px in, the text 40px in.
 */
export function MapSearchSkeleton() {
  return (
    <Skeleton className="flex h-[38px] min-w-0 items-center rounded-lg border border-divider bg-gray-2 ps-2 pointer-coarse:h-[46px]">
      <SkeletonBlock className="h-5 w-5 shrink-0 rounded-full" />
      <SkeletonLine className="ms-3 flex-1 field-size" width="w-2/5" />
    </Skeleton>
  )
}
