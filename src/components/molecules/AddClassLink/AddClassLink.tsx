import { Link } from '@/components/atoms/Link'

export type AddClassLinkProps = {
  /** The add-a-class route: `/add`, or a region's own `/add` so the search starts near it. */
  href: string
  label: string
}

/**
 * The quiet line at the foot of a list that opens the add-a-class flow (#147) — "Don't see your
 * class? Add it" under the results and the country index, "Add a class here" under a region.
 * It sits after the list rather than in a header, because it answers the list running out.
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
