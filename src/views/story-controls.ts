/**
 * The controls every view story shows, read by `ViewHarness` (`story-harness.tsx`). The Ladle
 * decorator adds them to each `views--` story and keeps their values from story to story
 * (`.ladle/components.tsx`), so no view declares them and none can be left without them.
 *
 * A module of its own that imports nothing: the decorator wraps every story, and through the
 * harness it would load the whole interface for these two definitions.
 */
export const VIEW_CONTROLS = {
  form: {
    type: 'radio',
    name: 'Form',
    // Inline in a host's page, or in the expanded map's panel.
    options: ['Inline', 'Expanded'],
    defaultValue: 'Inline',
    description: 'Inline in a host page, or the expanded map panel',
  },
  map: {
    type: 'boolean',
    name: 'Map',
    defaultValue: true,
    description: 'The live map a map embed draws. Off is a map=false embed, always inline',
  },
}
