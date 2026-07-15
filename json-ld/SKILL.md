---
name: json-ld
description: Implement, fix, and deepen schema.org structured data as JSON-LD across a codebase — including WordPress sites (Yoast/Rank Math/WooCommerce-aware) and Shopify Liquid themes. Proactively discovers every entity that deserves markup by scanning data models (ORM schemas, CMS content types, content collections, SQL, theme settings), routes, and templates; verifies every type and property against the live schema.org release and Google rich-results docs instead of model memory; and wires each value to the page's real data flow instead of hardcoding. Use this skill whenever the user asks for JSON-LD, structured data, schema markup, schema.org types, rich results/rich snippets, entity or knowledge-graph SEO, "add Product/Article/Event/... schema", structured data for a Shopify store or WordPress site, to fix structured-data errors from Search Console or a validator, to convert microdata/RDFa to JSON-LD, or to audit what structured data a site has.
license: MIT
---

# JSON-LD Structured Data

Implement and repair schema.org structured data (as JSON-LD) grounded in three sources of truth:

1. **The codebase's data models** — what entities actually exist and where they render
2. **The live vocabulary** — the current schema.org release and Google's current rich-results requirements, fetched fresh every run
3. **The real data flow** — every emitted property traced to a database column, CMS field, or frontmatter key; never hardcoded, never invented

The workflow is: **entity discovery scan → fetch fresh definitions → map data flow → one intake round with the user → implement in parallel → validate against rendered HTML**.

## Critical framing (read before emitting a single property)

- **Fresh definitions or stop.** schema.org ships new releases continuously (v30.0 landed 2026-03; types get added, superseded, and graduated from pending) and Google adds and *retires* rich-result types without ceremony (FAQ and HowTo rich results were demoted in 2023). Model memory about either is stale by construction. Every type and every property you emit MUST be verified against a definition fetched this run (`references/fresh-definitions.md`). If network access is unavailable, tell the user and stop — do not proceed from memory unless they explicitly accept stale definitions, and mark the output as unverified if they do.
- **Real data only.** Every value comes from a traced source: DB column, CMS field, frontmatter key, site config, or an intake answer. A property whose source is empty is *omitted*, not filled with a plausible guess. Never fabricate `aggregateRating`, `review`, `priceValidUntil`, or dates — fake review/rating markup is a documented Google manual-action trigger, and this skill must never create that liability.
- **Markup mirrors the visible page.** Google's policy: structured data must describe content the visitor can see on that page. Never mark up content that isn't rendered, never put the whole product catalog's markup on the homepage.
- **Deep, not generic.** The floor for "done" on a page: all properties required by Google for the type (or the gap reported), every recommended property the real data can support, stable `@id`s, and the page's nodes connected into one graph with the site-wide `Organization`/`WebSite` nodes — not an isolated `{"@type":"Product","name":"..."}` island. If the output would look like a tutorial snippet, it is not done.
- **Repair before replace.** Existing markup (JSON-LD, microdata, RDFa, or an SEO plugin's output) is audited, not blindly overwritten. Fix wrong values in place; convert formats or bypass a plugin only with the user's explicit OK from intake. Never let the page emit two conflicting nodes for the same entity.

## Phase 1 — Entity discovery (single agent, do this first)

Read `references/entity-discovery.md` and follow it to produce `jsonld-scan.md` at the **target** project's root — the codebase being marked up, not the cwd (in a monorepo: the workspace package being worked on). If that repo isn't yours to write to, or the user hasn't asked for files in their tree, use a scratch path and say where. The scan inventories:

- **Data models**: ORM schemas (Prisma, Drizzle, TypeORM, Django, Rails, …), SQL migrations, GraphQL SDL, CMS content types (Sanity, Contentful, Strapi, WordPress CPTs), content collections and markdown frontmatter. A read-only look at a live database is a last resort and only with user consent.
- **Routes and templates**: which entity renders on which URL pattern; detail vs listing vs static pages; SSR/SSG/CSR mode (JSON-LD must land in server-rendered HTML wherever possible).
- **Existing structured data**: `application/ld+json` blocks, microdata, RDFa, SEO libraries and plugins already emitting markup, OG/meta tags as data hints. On WordPress and Shopify the dominant emitters (SEO plugins, storefront apps, the theme itself) live outside the repo — there the rendered-HTML audit is mandatory.

The scan ends with an **entity inventory table**: entity → data source → pages → candidate schema.org type(s) → existing markup status → proposed action (`add` / `fix` / `deepen` / `convert` / `skip` + reason). Ambiguous type choices are marked for intake, not silently decided.

## Phase 2 — Fetch fresh definitions (before intake, so questions are informed)

Read `references/fresh-definitions.md`. For every candidate type in the inventory, fetch the live schema.org type page, the Google rich-results gallery and per-type doc (when eligible), and consult the JSON-LD 1.1 spec for syntax questions. Primary entity types get full Definitions blocks; structural/supporting types (WebPage, BreadcrumbList, Offer, ImageObject, …) may share abbreviated blocks — the reference explains the split. The same never-from-memory rule extends to platform data structures: on Shopify, query the Shopify Dev MCP (`@shopify/dev-mcp`) for Liquid objects and filter behavior, and recommend installing it if it isn't connected (config in `references/implementation-patterns.md`). Record the results in a `## Definitions` section of `jsonld-scan.md`: source URLs, fetch date, required/recommended properties, pending/superseded warnings. **Traceability rule: a property may be emitted only if it appears in this section.**

## Phase 3 — Map the data flow

Read `references/data-mapping.md`. For each (entity, page) pair, build a property map: JSON-LD property → concrete source (`products.sale_price`, `frontmatter.author`, `astro.config site`) → transform (ISO 8601, absolute URL, strip markdown) → null handling. This is also where the `@id` scheme and the page-graph structure (`WebPage` + primary entity + `BreadcrumbList`, referencing site-wide `Organization`/`WebSite`) are designed. Properties with no real source go on the **gap list**, split into: askable in intake (org facts, social profiles) vs. genuinely missing data (reported, not invented).

## Phase 4 — Intake: one consolidated round of questions

With scan + definitions + gaps in hand, ask the user **one** round (AskUserQuestion tool if available, otherwise a compact numbered list). At most 4 questions, each with a recommended default. Ask only what the code cannot answer:

1. **Scope & actions** — present the inventory table's proposed actions and let them adjust; include disposition of existing markup (fix in place / convert to JSON-LD / leave).
2. **Ambiguous types** — e.g. Product vs Service vs SoftwareApplication, Article vs BlogPosting vs NewsArticle, LocalBusiness subtype — with your recommendation and the concrete consequence of each choice (which rich results, which required properties).
3. **Identity facts not in code** — legal/brand name, logo, `sameAs` social profiles, founder/founding data if an Organization node is warranted.
4. **Data-exposure decisions** — publish prices/availability? mark up user reviews (only if they demonstrably exist)? — anything where markup makes data more machine-visible than the user may intend.

If the environment is non-interactive: adopt the scan's recommended actions, choose the conservative option for every ambiguity, leave identity facts out rather than guessing, and say so in the report.

## Phase 5 — Implement (parallel agents)

Read `references/implementation-patterns.md` yourself, then spawn one agent per entity group (e.g. one for the site-wide Organization/WebSite/Breadcrumb layer, one per templated page type: products, articles, events…). Each agent prompt must include: the paths to `jsonld-scan.md` and `references/implementation-patterns.md` (read both first), its slice of the inventory + property maps + intake answers verbatim, the detected framework conventions, and the shared `@id` scheme. Agents write code, not prose: framework-idiomatic injection, XSS-safe serialization (escape the `<` character as the sequence backslash-u003c after `JSON.stringify` — never raw-interpolate user content into a `<script>` tag), one shared builder module so `Organization`/`WebSite` nodes are defined once and referenced by `@id` everywhere else.

Hard rules for every implementation agent: never emit a property absent from the Definitions section; never emit a value without a source in the property map; templates read live fields from the same data the page renders (a JSON-LD block built from different data than the visible page will drift and violate Google policy). If two agents would edit the same file, do that file yourself in Phase 6 instead.

**Environments without subagents:** do the same work sequentially — site-wide layer first, then each page type.

## Phase 6 — Validate against rendered output & report

Read `references/validation.md`. In order:

1. **Static checks** — every block parses as JSON; every property traceable to Definitions; dates ISO 8601; URLs absolute; no empty/placeholder values.
2. **Rendered-HTML check** — build or run the dev server, fetch the real HTML for one URL per page type, and run `scripts/extract-jsonld.mjs` on it: proves the markup survives the framework's actual rendering and escaping. This step is not optional when a build is possible.
3. **Live validators** — when browser tooling is available, run one representative page per type through validator.schema.org and Google's Rich Results Test. If not available, say the validation was local-only.
4. **Report**: per page type — types emitted, Google-required coverage, recommended-property coverage (n of m, with the missing ones named), gaps left because source data doesn't exist (and where to add it), what was deliberately *not* marked up and why (e.g. "FAQ markup skipped — no longer yields rich results for regular sites"), validator results, and the follow-ups code can't do (verify in Search Console after deploy, re-run validators after content model changes).

## When the user asks for a subset

"Just fix the Product schema" still gets Phase 1 (scoped to product pages + the site-wide layer, since a Product node referencing a broken Organization `@id` is still broken), Phase 2 for the types involved, and the Phase 6 rendered-HTML check. The scan is what makes the fix correct; only its breadth shrinks.
