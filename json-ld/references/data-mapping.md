# Phase 3 — Map the data flow

Structured data is only trustworthy if every value is wired to the same data the page renders. This phase produces, for each (entity × page-type), a **property map** — the contract the implementation agents code against.

## The property map

Append to `jsonld-scan.md` under `## Property maps & gap list`, one table per entity × page-type:

```markdown
### BlogPosting on /blog/[slug]
| Property | Source | Transform | If empty |
|---|---|---|---|
| headline | post.title (CMS field) | none | impossible — required by route |
| datePublished | post.publishedAt | ISO 8601 w/ timezone | omit + gap-list |
| dateModified | post.updatedAt | ISO 8601 | fall back to publishedAt |
| image | post.cover → urlFor(post.cover) | absolute URL; note real aspect ratio | omit |
| author | post.author → Person node | reference by @id | intake: default author? |
| description | post.excerpt | strip markdown, plain text | derive: first paragraph, stripped |
| mainEntityOfPage | canonical URL | absolute | — |
```

Rules for filling it:

- **Source = a real code path.** Trace it: DB column / CMS field → query/loader → component prop. If the page renders `product.salePrice` but the map says `product.price`, the map is wrong. The JSON-LD builder must consume the *same object* the template consumes, so the two can't drift.
- **"If empty" is decided per property, in advance.** The options are: omit the property; fall back to another *real* field (documented here); ask in intake (identity facts only); or gap-list it. "Invent a value" is never an option. An `Offer` without `priceValidUntil` is valid; an invented `priceValidUntil` is a lie with an expiry date.
- **Transforms are named, not improvised**: dates → ISO 8601 (`2026-07-15` or with time + offset; durations as ISO 8601 durations `PT1H30M`); URLs → absolute against the site-URL source found in Phase 1; rich text → plain text (strip HTML/markdown); prices → plain number/string without currency symbols + separate `priceCurrency`; enums → full schema.org URLs (`https://schema.org/InStock`); images → absolute URLs to real files, largest available, with `width`/`height` when the pipeline knows them (Google's image guidance often expects multiple aspect ratios — check the fetched per-type doc, and note what this site can actually provide). Platform quirks belong in the Transform column too: Shopify money values are minor units (cents → `| divided_by: 100.0`); WordPress dates via `get_the_date('c')`-style ISO output; CMS rich text through the platform's own strip/plain-text filter.

## The `@id` scheme and page graph

Design once, record in the scan file, reuse everywhere. Recommended scheme — stable, canonical-URL-based IRIs:

- `{site}/#organization` — the Organization node
- `{site}/#website` — the WebSite node
- `{pageUrl}/#webpage` — each page's WebPage node
- `{pageUrl}/#breadcrumb` — its BreadcrumbList
- `{pageUrl}/#{entity}` — the primary entity (`#product`, `#article`, `#event`)
- `{site}/team/{slug}/#person` (or similar canonical home) for entities referenced from many pages

Per page, emit **one** `<script type="application/ld+json">` containing `{"@context": "https://schema.org", "@graph": [...]}` with the page's nodes, cross-linked by `{"@id": ...}` references instead of duplicated inline objects:

- `WebPage` → `isPartOf` → `{"@id": ".../#website"}`; `about`/`mainEntity` → the primary entity
- primary entity → `mainEntityOfPage` → the WebPage; `publisher`/`brand`/`provider` → `{"@id": ".../#organization"}`
- `WebSite` → `publisher` → Organization
- The full `Organization` and `WebSite` nodes are emitted on every page (same `@id`, byte-identical content, built by one shared function) so every page's graph is self-contained yet merges consistently.

`Organization` node depth (the difference between a knowledge-panel candidate and a name tag): `name`, `legalName` (if different), `url`, `logo` (`ImageObject` with dimensions), `sameAs` (every real official profile — from intake, never guessed), `description`, and contact/address/founding fields only when real. `WebSite` gets `SearchAction`/`potentialAction` **only if the site actually has internal search**.

## Referencing off-page entities

For pointers to things that live elsewhere (`subjectOf`, `citation`, `isBasedOn`, `mentions` — a LinkedIn post about the product, a press article, a talk recording): use the **most generic accurate type** — `CreativeWork`, `WebPage`, or `Thing` — with `url` and `name`. Never type a bare reference as a rich-result-candidate type (`SocialMediaPosting`, `DiscussionForumPosting`, `Review`, `Product`, `JobPosting`, `FAQPage`, `VideoObject`, …): Google evaluates candidate types **wherever they appear in the graph**, including nested reference values, and a reference lacking that feature's required fields is reported as an *invalid item on your page* (a url-only `SocialMediaPosting` in `subjectOf` gets judged — and failed — as a Discussion Forum item). Reserve feature-candidate types for entities genuinely on the page with their required data wired.

## Listing pages and multi-entity pages

- Listing/category pages: `ItemList` whose `itemListElement` are `ListItem`s with `position` + `url` pointing at the detail pages — do **not** duplicate each item's full markup on the list page (check the fetched Google carousel doc for when summary-page vs all-in-one applies).
- A page may legitimately carry several entities (Article + VideoObject; LocalBusiness + Event). Put them in the same `@graph`, each with its own `@id`, linked through the WebPage node — never two disconnected script tags describing overlapping things.

## The gap list

Everything the markup *should* say but the data can't support, split into:

1. **Intake-askable** — org identity, social profiles, logo, default author: facts a human knows offhand. → Phase 4.
2. **Missing data** — no `updatedAt` column, images without dimensions, reviews that exist as text but not as structured records. → Reported in Phase 6 with the concrete change that would unlock the property ("add `updatedAt` to the posts table → enables `dateModified`, which Google recommends for Article"). These are product recommendations, not blockers.
