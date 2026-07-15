# Phase 6 — Validation & report

Validation runs against the **rendered HTML**, not just the source — the whole point is proving what crawlers actually receive. Run the layers in order; each catches what the previous can't.

## Layer 1 — Static checks (always)

For every emitted graph:

1. **Parseable**: each `application/ld+json` block is valid JSON (the extract script below does this).
2. **Traceable**: every property of every node — including pre-existing nodes kept in place — appears in the scan file's `## Definitions` section; every value the run emitted has a row in the property map. Anything untraceable is a bug in this run — fix the process, not just the output.
3. **Formats**: dates/durations ISO 8601; URLs absolute; enum values full `https://schema.org/...` URLs; prices bare numbers with separate `priceCurrency`; no `null`, `""`, `"TODO"`, or placeholder values anywhere (omission is the correct encoding of absence).
4. **Graph integrity**: every `{"@id": ...}` reference resolves to a node defined in the same page's graph; no two nodes share an `@id` with different content; exactly one `Organization` and one `WebSite` node per page.
5. **No feature-candidate types as bare references**: nested/off-page reference values (`subjectOf`, `citation`, …) must not carry rich-result-candidate types without that feature's required fields — Google evaluates them wherever they sit in the graph (see the referencing rule in `data-mapping.md`).
6. **Coverage vs. definitions**: per type — all Google-required properties present (or the gap consciously reported), each Google-recommended property either present or accounted for on the gap list.

## Layer 2 — Rendered-HTML check (whenever the project can build or serve)

Build the site or start the dev server (commands were recorded in the Phase 1 scan). For **one representative URL per page type**:

```sh
curl -s http://localhost:PORT/some/page | node <skill>/scripts/extract-jsonld.mjs
# or from a build directory:
node <skill>/scripts/extract-jsonld.mjs dist/blog/some-post/index.html
```

The script extracts every JSON-LD block from real HTML and parses it; non-zero exit = a block is missing or unparseable. This catches what source review can't: framework escaping mangling the payload, the script tag rendered client-side only (fetch with curl = no JS, exactly like most crawlers), conditional rendering dropping the block, template values arriving empty at runtime.

Diff sanity: the values in the rendered block must match the visible page content (title in the JSON = title on the page). Spot-check, don't assume.

## Layer 3 — Live validators

- **validator.schema.org** — checks vocabulary conformance against the current release. For deployed pages this needs no browser: its (unofficial, so verify it still works) endpoint answers curl —

  ```sh
  curl -s -X POST "https://validator.schema.org/validate" \
    --data-urlencode "url=https://example.com/page" | sed "s/^)]}'//"
  # JSON response: check totalNumErrors / totalNumWarnings; warning entries
  # carry errorType (e.g. UNKNOWN_FIELD) + the offending property name.
  ```

  Run it on every page type, not a sample — it's cheap, and UNKNOWN_FIELD warnings are exactly the undefined-property class local review misses.
- **Google Rich Results Test** (`https://search.google.com/test/rich-results?url=<encoded>`) — browser only; the authority on rich-result eligibility. Accepts a public URL or pasted code (use pasted code for localhost-only work). Drill into every "invalid item" and every "non-critical issue" — report what each one is; "non-critical" for a deliberately omitted optional field (e.g. no fabricated rating) is a pass, not a problem.

Record pass/fail + warnings per page type. If neither tool is reachable → state plainly in the report that validation was local-only and list the two URLs for the user to run manually.

## The report

End with a report the user can act on:

1. **Per page type**: types emitted, Google-required coverage (✔ or the named blocker), recommended coverage as *n of m* with the missing ones named, validator status.
2. **Files created/modified** — builder module, touched templates, removed duplicate/legacy markup.
3. **Gap list, translated to actions**: "no `dateModified` — posts table has no `updatedAt`; adding one enables a Google-recommended Article property" — data-model improvements the user can choose to make, each tied to the property it unlocks.
4. **Deliberate omissions with reasons** — entities skipped, types avoided (pending status, retired rich results, fabrication risk), so lean output reads as decisions, not gaps.
5. **What code can't do**: request re-indexing / monitor Search Console's structured-data reports after deploy (enhancements take days-weeks to appear); re-run validators after content-model changes; keep intake facts (logo, sameAs) current.
