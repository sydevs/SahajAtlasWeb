import { SVGProps } from 'react'
export * from './client'
export * from './event'
export * from './geojson'
export * from './ip-location'
export * from './region'
export * from './registration'

export type IconSvgProps = SVGProps<SVGSVGElement> & {
  size?: number
}
