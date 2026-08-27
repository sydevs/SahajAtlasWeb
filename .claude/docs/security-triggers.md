---
globs: ['.claude/workflow.json', 'src/**']
---

# Why the security-review trigger list looks like this

`.claude/workflow.json` → `securityReview.triggerPattern` decides when `/finalize-pr` runs a
security review. The pattern is config; **this file is the reasoning**, which JSON cannot carry.
It moved here when the workflow skills became the shared `sydevs/workflow` plugin — the paths vary
per repo, the rationale does not travel.

This widget ships a **public bundle embedded in untrusted host pages**, so the risky surface is
client-side: the API-key/auth + data layer, the widget's host-prop trust boundary, the guards that
decide where a data-driven `href` may point, untrusted-HTML (XSS) sinks, the stylesheet we inject
into somebody else's `<head>`, the host's privacy opt-outs, dependencies, and anything touching
secrets/env.

**Widen the list deliberately, never maximally.** A trigger that fires on everything stops being
read, at which point it is worth no more than one that never fires.

Each entry is somewhere a change reaches a host page's visitors, and most are there because
something got through:

| Entry | Why |
| --- | --- |
| `shape/path`, `shape/href`, `atoms/Link/` | The same-origin/scheme guard. `//evil.com` walked past an `href.startsWith('/')` check in **#100** — on a branch this grep did *not* match, which is why it was widened. |
| `shape/routing` | Picks the query router vs memory from whether the host's URL is writable — an untrusted input choosing a branch (**#92**). |
| `src/styles/`, `lib/scope`, the PostCSS scoping script and config | Keep our injected stylesheet off the host's DOM (**#91**, **#104**). |
| `lib/report` | Decides what leaves the visitor's browser at all (**#95**, **#108**). |
| `pnpm-lock.yaml`, `patches/` | The supply-chain pair — the transitive bump that never touches `package.json`, and arbitrary code applied to a dependency (which is why `patches/vaul@1.1.2.patch` exists at all). |

**The module entries are deliberately unanchored, so a spec travels with its module** — the
`src/lib/shape/path` entry matches `path.test.ts` as well as `path.ts`. That matters because several
of these guards are enforced by an assertion rather than by a reader: `href.test.ts` pins the JSX
anchor inventory to exactly three components (`atoms/Link/`, `atoms/Button/`, `molecules/ActionRow/`)
and fails if any of them stops calling `isSafeHref`; `path.test.ts` pins `//evil.com` and the
tab/LF/CR forms. Deleting one of those assertions is precisely the diff worth seeing.

So **prefer adding the assertion over adding the path** — a red unit lane is faster and surer than a
review. That is why `src/config/i18n-options.ts` is deliberately absent: its one privacy property,
`caches: []` (it must never write `i18nextLng` onto the host's origin, **#95**), is asserted in
`i18n-options.test.ts`.

## The content trigger

`securityReview.contentPattern` catches a newly-introduced HTML sink wherever it lands, which no
path list can anticipate:

```
dangerouslySetInnerHTML|dompurify|DOMPurify|\.innerHTML
```

Either trigger matching runs the review. Neither matching means the report should say so out loud —
"no security-relevant paths changed" — rather than silently skipping.
