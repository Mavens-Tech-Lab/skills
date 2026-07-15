# Phase 2 — Fetch fresh definitions (never trust memory)

Every type and property this skill emits must be verified against a definition **fetched during this run**. This is a hard rule, not hygiene. Why:

- schema.org releases continuously — types are added, marked `supersededBy`, and graduate from or into pending status. (Example of drift: v30.0, released 2026-03-19, postdates every LLM's training data.)
- Google adds and **retires** rich-result types without deprecating the vocabulary — FAQ and HowTo rich results were demoted for most sites in August 2023 while `FAQPage`/`HowTo` remain valid schema.org types. Only the live docs know today's list.
- Half-remembered property names (`datePublished` vs `publishDate`, `offers` vs `offer`) are exactly the class of bug validators flag.

## Sources of truth (in order)

| Question | Source |
|---|---|
| Does this type exist? What are its properties and their expected value types? Is it pending or superseded? | `https://schema.org/<TypeName>` (exact CamelCase; the page footer shows the release version — record it) |
| Current release + machine-readable dump | `https://schema.org/docs/releases.html`; full vocabulary at `https://schema.org/version/latest/` (prefer per-type pages — the dump is huge) |
| Is this type eligible for a Google rich result **today**? | `https://developers.google.com/search/docs/appearance/structured-data/search-gallery` — the live list, nothing else |
| Google's required/recommended properties + content policies for an eligible type | `https://developers.google.com/search/docs/appearance/structured-data/<feature>` (linked from the gallery) |
| JSON-LD syntax semantics: `@graph`, `@id`, `@context`, nesting vs referencing | JSON-LD 1.1 spec via `https://json-ld.org` → `https://www.w3.org/TR/json-ld11/` |
| Platform data structures (Shopify: Liquid object fields, filter behavior, theme best practices) | **Shopify Dev MCP** (`@shopify/dev-mcp`) when connected — query it instead of memory, same rule as the vocabulary; fallback `https://shopify.dev/docs/api/liquid`. WordPress plugin APIs: the plugin's current developer docs |

Use WebFetch (or the environment's equivalent). **If no network access is available: stop and tell the user.** Offer the choice to proceed from memory only as an explicit opt-in, and if taken, stamp every output file and the final report with "generated from unverified (possibly stale) definitions — re-validate online".

## Procedure per candidate type

Scope the fetching by role, or a full site sweep explodes into dozens of lookups:

- **Primary entity types** (the inventory's candidate types: Product, Article, Event, Organization, …) → the full procedure below, one Definitions block each.
- **Structural & supporting types** (WebPage and subtypes, BreadcrumbList/ListItem, ItemList, Offer, ImageObject, ContactPoint, Person-as-author, …) → still fetched, but recorded as **abbreviated entries**: either a `value-type notes` line inside the parent's block or a shared `### Supporting types` block listing each type, its source URL, and just the properties being emitted. The traceability rule is satisfied by either form — what matters is that every emitted property of every node traces to a fetched source recorded in the section, not that every type gets its own heading.

1. Fetch `https://schema.org/<Type>`. Record: canonical spelling, parent type, whether **pending** (avoid pending types unless the user opts in — consumers ignore them) or **superseded** (use the successor), and the expected value types of every property you plan to emit. You don't need the full property list — you need an entry for each property Phase 3 wants to use, plus a skim of what else the type offers that the site's data could support (this is where "deepen" opportunities come from).
2. Check the Google gallery for eligibility. If eligible, fetch the per-type doc and record the **required** and **recommended** property lists verbatim, plus any content policy that affects this site (e.g. review markup must be for genuine, user-visible reviews; JobPosting must be an actual current opening).
3. Distinguish three tiers in your notes — they drive different behavior:
   - **Google-required** → must be present or the gap goes in the report as blocking rich-result eligibility
   - **Google-recommended** → emit every one the real data supports
   - **schema.org-valid only** → emit when the data is there and the property adds machine-readable meaning; skip decorative trivia
4. For property value questions (is `author` allowed to be an `Organization`? does `duration` want ISO 8601?), the fetched type/property pages answer — not memory.

## Recording — the `## Definitions` section

Append to `jsonld-scan.md`, one block per type:

```markdown
### Product  (schema.org vNN.N — copy the version from the fetched page footer, fetched YYYY-MM-DD — today's real date)
- sources: https://schema.org/Product · https://developers.google.com/search/docs/appearance/structured-data/product
- status: current (not pending/superseded) · rich result: YES (product snippets + merchant listing)
- Google required: name, (offers | review | aggregateRating)
- Google recommended (emitting the ones data supports): image, description, sku, brand, offers.price, offers.priceCurrency, offers.availability, ...
- value-type notes: offers → Offer; availability → ItemAvailability enum URL; price as string/number, no currency symbols
```

**Traceability rule (enforced in Phase 6):** if a property isn't recorded in this section — in a full block, a parent's value-type notes, or the Supporting types block — it doesn't get emitted. When an implementation agent wants an extra property mid-flight, it fetches, records here, then emits — in that order.

**The rule covers kept markup too.** Fetch definitions for every type that stays in the final graph, including existing nodes whose action is `keep`: each of their current properties must appear in the fetched definition, or the row's action flips to `fix`. Pre-existing markup is not grandfathered — undefined properties on valid-looking nodes are precisely what code review misses and validators flag.
