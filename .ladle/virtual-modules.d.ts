// `ladle:react-map-gl` is react-map-gl's own mapbox entry, aliased in `.ladle/vite.config.ts` so
// the wrapper beside this file can import the package that `react-map-gl/mapbox` stands in for.
declare module 'ladle:react-map-gl' {
  export * from 'react-map-gl/mapbox'
}
