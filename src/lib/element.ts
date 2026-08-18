/**
 * The custom element's tag name, in a leaf module of its own.
 *
 * It lives here rather than in `Widget.tsx` for one reason: the loader carries a duplicate
 * (`src/loader/literals.ts`, and why it duplicates rather than imports is argued there), and the
 * spec that pins the two together has to import both. Importing `Widget.tsx` to read one string
 * would drag mapbox-gl, vaul and every eager view into the node lane — the same argument that
 * split `stripLabel` out of `DrawerStack.tsx`.
 *
 * The name is a **published contract**: it is in `docs/embedding.md`, and a Wix Custom Element is
 * configured by typing it into an editor field. Renaming it breaks every existing install for no
 * visitor-facing gain.
 */
export const ELEMENT_NAME = 'sahaj-atlas'
