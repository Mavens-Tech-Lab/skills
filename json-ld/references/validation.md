# Phase 6 — Validation & report

Validation runs against the **rendered HTML**, not just the source — the whole point is proving what crawlers actually receive. Run the layers in order; each catches what the previous can't.

## Layer 1 — Static checks (always)

For every emitted graph:

1. **Parseable**: each `application/ld+json` block is valid JSON (the extract script below does this).
2. **Traceable**: every property appears in the scan file's `## Definitions` section; every value has a row in the property map. Anything untraceable is a bug in this run — fix the process, not just the output.
3. **Formats**: dates/durations ISO 8601; URLs absolute; enum values full `https://schema.org/...` URLs; prices bare numbers with separate `priceCurrency`; no `null`, `""`, `"TODO"`, or placeholder values anywhere (omission is the correct encoding of absence).
4. **Graph integrity**: every `{"@id": ...}` reference resolves to a node defined in the same page's graph; no two nodes share an `@id` with different content; exactly one `Organization` and one `WebSite` node per page.
5. **Coverage vs. definitions**: per type — all Google-required properties present (or the gap consciously reported), each Google-recommended property either present or accounted for on the gap list.

## Layer 2 — Rendered-HTML check (whenever the project can build or serve)

Build the site or start the dev server (commands were recorded in the Phase 1 scan). For **one representative URL per page type**:

```sh
curl -s http://localhost:PORT/some/page | node <skill>/scripts/extract-jsonld.mjs
# or from a build directory:
node <skill>/scripts/extract-jsonld.mjs dist/blog/some-post/index.html
```

The script extracts every JSON-LD block from real HTML and parses it; non-zero exit = a block is missing or unparseable. This catches what source review can't: framework escaping mangling the payload, the script tag rendered client-side only (fetch with curl = no JS, exactly like most crawlers), conditional rendering dropping the block, template values arriving empty at runtime.

Diff sanity: the values in the rendered block must match the visible page content (title in the JSON = title on the page). Spot-check, don't assume.

## Layer 3 — Live validators (when browser tooling is available)

- **validator.schema.org** — paste the rendered HTML or the page URL; checks vocabulary conformance against the current release.
- **Google Rich Results Test** (`https://search.google.com/test/rich-results`) — accepts a public URL or pasted code; the authority on rich-result eligibility. For localhost-only work, paste the rendered HTML as code.

Record pass/fail + warnings per page type. No browser tooling → state plainly in the report that validation was local-only and list the two URLs for the user to run manually.

## The report

End with a report the user can act on:

1. **Per page type**: types emitted, Google-required coverage (✔ or the named blocker), recommended coverage as *n of m* with the missing ones named, validator status.
2. **Files created/modified** — builder module, touched templates, removed duplicate/legacy markup.
3. **Gap list, translated to actions**: "no `dateModified` — posts table has no `updatedAt`; adding one enables a Google-recommended Article property" — data-model improvements the user can choose to make, each tied to the property it unlocks.
4. **Deliberate omissions with reasons** — entities skipped, types avoided (pending status, retired rich results, fabrication risk), so lean output reads as decisions, not gaps.
5. **What code can't do**: request re-indexing / monitor Search Console's structured-data reports after deploy (enhancements take days-weeks to appear); re-run validators after content-model changes; keep intake facts (logo, sameAs) current.
