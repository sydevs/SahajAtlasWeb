import * as Dialog from '@radix-ui/react-dialog'

import { Button } from '@/components/atoms/Button'
import { Link } from '@/components/atoms/Link'
import { ModalBody, ModalContent } from '@/components/atoms/Modal'

export function StoryNotes() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost">
          Story notes
        </Button>
      </Dialog.Trigger>
      <ModalContent className="max-w-[640px]!" closeLabel="Close story notes" title="Story notes">
        <ModalBody className="space-y-5 pb-5 text-sm leading-relaxed [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold">
          <p>
            SEO requirements for the published class page. Review these on the host website using
            the HTML a crawler receives.
          </p>
          <section>
            <h2>Class heading and search result</h2>
            <p>
              Use one H1 with the class name, activity and confirmed local place. “Friday Morning
              Meditation in Cambridge” is the example here. Write the search title in the local
              language. The English pattern is “Free Meditation in Ringwood, Victoria – Tuesdays -
              Sahaja Yoga Classes”. Omit the weekday when the schedule has none.
            </p>
            <p className="mt-2">
              Write a short, unique meta description from visible facts such as the venue, day, time
              and free admission. Set a matching Open Graph title, description and representative
              image for sharing.
            </p>
          </section>
          <section>
            <h2>How the class gets its area name</h2>
            <p>
              When an organiser adds or edits a venue, use Mapbox to suggest the neighbourhood,
              locality and parent city. The organiser confirms the spelling and can add a locally
              meaningful landmark or metro station. Use SahajCloud Regions as the one registry. AI
              can flag duplicates and missing parents for review.
            </p>
            <p className="mt-2">
              Format places by language and country. Enfield, London and Санкт-Петербург, м.
              Проспект Просвещения are different ways to locate a class. Use the full state or
              country when needed to distinguish places. Reuse the confirmed names in headings,
              metadata and place links.
            </p>
            <p className="mt-2">
              Use permanent geocoding for stored Mapbox results.{' '}
              <Link
                isExternal
                className="underline"
                href="https://docs.mapbox.com/api/search/geocoding/#storing-geocoding-results"
              >
                Mapbox storage guidance
              </Link>
            </p>
          </section>
          <section>
            <h2>What a crawler should find</h2>
            <p>
              Serve the title, description, H1, schedule, address, cost and class description in the
              initial HTML. Link from a place page to the class and back with ordinary HTML links.
              Opening the map, slideshow or registration keeps the same indexable class page.
            </p>
            <p className="mt-2">
              Publish one canonical URL per class. Prefer the national site when it fully hosts the
              Atlas, otherwise We Meditate. List active, scheduled classes in the sitemap. Mark
              inactive or unscheduled classes noindex. Redirect old class URLs permanently and
              connect published language versions with reciprocal hreflang links.
            </p>
          </section>
          <section>
            <h2>Structured data for scheduled classes</h2>
            <p>
              Use Event JSON-LD for a real upcoming session. Match the visible name, description,
              start and end with local time offsets, venue and postal address. Include the
              organiser, free admission, a zero-price offer with local currency and a representative
              image when available.
            </p>
            <p className="mt-2">
              The weekly class keeps a stable URL. Google requires a dedicated event URL for each
              occurrence that targets its event results. Decide whether to publish those pages
              before promising rich results. Validate a published example with the Rich Results Test
              and inspect its canonical in Search Console.{' '}
              <Link
                isExternal
                className="underline"
                href="https://developers.google.com/search/docs/appearance/structured-data/event"
              >
                Google event guidance
              </Link>
            </p>
          </section>
        </ModalBody>
      </ModalContent>
    </Dialog.Root>
  )
}
