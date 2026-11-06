// PROTOTYPE (Anton, 6 Nov): two places for the list-first view's map control, compared side by
// side in the review. `?mapButton=float` puts a "Map" pill at the bottom of the open panel;
// `?mapButton=header` puts "Map" beside "Calendar" on the Back row. Without it, today's "Show
// map" row stays. Read once from the page's address, so an in-app navigation keeps it. Remove the
// option Anton doesn't pick, then this file.

export type MapButtonPlacement = 'row' | 'float' | 'header'

const readPlacement = (): MapButtonPlacement => {
  try {
    const value = new URLSearchParams(window.location.search).get('mapButton')

    return value === 'float' || value === 'header' ? value : 'row'
  } catch {
    return 'row'
  }
}

export const MAP_BUTTON: MapButtonPlacement =
  typeof window === 'undefined' ? 'row' : readPlacement()
