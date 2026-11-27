import { createContext, useContext } from 'react'

import { type FilterRowPlace } from '@/lib/shape'

/**
 * Where the filter buttons are on this layout (`filterRowPlace`), shared by `DrawerStack`, which
 * measures the widget. `null`, as outside it, means the filters stay behind the Filters button.
 */
export const FilterRowContext = createContext<FilterRowPlace>(null)

/**
 * Where the filter buttons are. While they show anywhere, the Filters button and the list's filter
 * tags step aside, so each answer shows once.
 */
export const useFilterRow = (): FilterRowPlace => useContext(FilterRowContext)
