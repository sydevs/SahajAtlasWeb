import { Link } from '@/components/atoms/Link'

export type AddClassLinkProps = {
  /** `/add`, a region's own `/add` so the search starts near it, or a class's `/correct`. */
  href: string
  label: string
}

/**
 * The quiet foot-of-panel line into the add-a-class flow (#147) — "Don't see your class? Add
 * it" under the results and the country index, "Add a class here" under a region, "Suggest a
 * correction" under a class. It sits after the content rather than in a header, because it
 * answers the content running out or being wrong.
 */
export function AddClassLink({ href, label }: AddClassLinkProps) {
  return (
    <p className="px-4 py-4 text-center text-sm text-gray-11">
      <Link className="underline underline-offset-2" href={href}>
        {label}
      </Link>
    </p>
  )
}
