# Phase 1 — Entity discovery scan

Goal: find **every** entity in this codebase that should carry structured data — not just the obvious ones the user mentioned — and record where its data lives and where it renders. Output is `jsonld-scan.md`, written at the **target** project's root (the codebase being marked up — not the cwd; in a monorepo, the workspace package). If the repo isn't yours to write to or the user hasn't asked for files in their tree, write to a scratch path instead and report where. The inventory table drives every later phase.

Work breadth-first: identify the stack, then sweep data models, routes, and existing markup in parallel (subagents or sequential greps), then join the three views into the inventory.

## 1. Stack & rendering mode

Detect and record:

- Framework and version (`package.json`, `composer.json`, `Gemfile`, `requirements.txt`, config files).
- **Rendering mode per route type** — SSR, SSG, or client-only. This matters: JSON-LD must be present in the HTML response. Google renders JavaScript; most other consumers (Bing, LLM crawlers, social scrapers) read raw HTML. Client-only injection is a finding to report, not a pattern to copy.
- Site URL source of truth: `astro.config` `site`, `next-sitemap` config, `NEXT_PUBLIC_SITE_URL`-style env vars, CMS settings, canonical tags in a base layout. Structured data needs absolute URLs; find where the codebase already knows its own origin. If nowhere → intake question.
- Existing SEO infrastructure: `next-seo`, `astro-seo`, `nuxt-schema-org` / `@unhead/schema-org`, `schema-dts`, Yoast/RankMath (WordPress), metatag modules. If a library or plugin already emits JSON-LD, later phases must extend it, not fight it.

## 2. Data model sweep

An entity worth marking up almost always has a code-level definition. Look in ALL of these that exist:

| Where | What to read |
|---|---|
| Prisma | `schema.prisma` models |
| Drizzle / TypeORM / Sequelize / Mongoose | schema/entity/model files |
| Django / Rails / Laravel | `models.py`, `app/models`, migrations, `schema.rb` |
| Plain SQL | migration folders, `.sql` dumps |
| GraphQL | SDL files, codegen output |
| Headless CMS | Sanity `schemaTypes`, Contentful content-type exports/migrations, Strapi `src/api/*/content-types`, Payload collections, Directus snapshots |
| WordPress | registered custom post types + ACF field groups |
| File-based content | Astro/Nuxt content collections config, Contentlayer, markdown frontmatter fields (sample several real files — frontmatter is the schema) |
| Config-as-data | JSON/YAML data files (`src/data/*`), hardcoded arrays that render lists (team members, testimonials, FAQs, pricing tiers) |

For each model, record: name, the fields relevant to structured data (title/name, description, dates, images, price, author/relations, slug), and which fields are optional/nullable — nullability decides what the markup can promise.

**Live database**: only when there are no code-level models but a connection string is configured (e.g. a raw `pg` app). Ask the user first, then introspect read-only (`information_schema`, `\d`, `SHOW TABLES`). Never query row data beyond a `LIMIT 3` sample to understand field shapes.

## 3. Route & template sweep

Map URLs to entities:

- Enumerate routes: `app/`/`pages/` (Next), `src/pages` (Astro), `routes/` (SvelteKit/Remix), router configs, `urls.py`, `routes.rb`, sitemap generators.
- Classify each route: **detail page** (one entity instance — the prime markup target), **listing page** (collection → `ItemList`/carousel candidates), **static identity page** (home, about, contact — `Organization`/`WebSite`/`AboutPage` targets), **utility** (skip).
- For templated routes, note which model feeds the template and through what path (loader, `getStaticPaths`, controller) — Phase 3 needs this trace.

## 4. Existing structured data audit

Grep the codebase AND (if a build exists or a dev server can run) the rendered HTML of a few representative pages — this skill's `scripts/extract-jsonld.mjs` extracts and parses the blocks from any HTML file or piped curl output:

- JSON-LD: `application/ld+json` — collect every emitting site: hand-rolled script tags, SEO-lib components, plugin output.
- Microdata: `itemscope`, `itemtype`, `itemprop`. RDFa: `vocab=`, `typeof=`, `property=`.
- For each existing block: which type, is it valid, is the data correct *right now* (stale org names and dead social links are common), is it duplicated by another emitter on the same page.
- Meta layer as data hints: OG tags, twitter cards, canonical tags — these reveal which fields the site already treats as its public description.

Classify each finding: `valid & complete` / `valid but shallow` (bare name+type, no graph, missing recommended props) / `invalid` (parse errors, wrong property names, wrong value types) / `wrong format` (microdata/RDFa candidate for conversion) / `conflicting` (two nodes disagree about the same entity).

## 5. Candidate type mapping

Map each entity to schema.org candidate type(s). Common mappings to check against (verify every choice against the live definition in Phase 2 — this table is a starting point, not an authority):

- Products/plans/pricing → `Product` + `Offer` (or `Service`; software → `SoftwareApplication`/`WebApplication`) — ambiguity is an intake question
- Blog/news/docs → `BlogPosting` / `NewsArticle` / `Article` / `TechArticle`
- Events, webinars → `Event` (+ `virtualLocation`)
- Jobs page → `JobPosting`; recipes → `Recipe`; videos → `VideoObject`; courses → `Course`
- Physical presence, opening hours → `LocalBusiness` (pick the most specific subtype from the live hierarchy)
- Company identity → `Organization` (site-wide node); people/team/authors → `Person`
- Site itself → `WebSite` (+ `SearchAction` only if internal search exists); every page → `WebPage` subtype; nav trails → `BreadcrumbList`
- FAQs, HowTos → mark as **policy-check candidates**: eligibility for rich results has changed over time; Phase 2 decides from the live Google docs, not from habit

Do NOT invent an entity to justify a type. A site with no events gets no Event markup.

## 6. Output: `jsonld-scan.md`

```markdown
# JSON-LD scan — <project> — <date>

## Stack
framework, rendering mode per route class, site-URL source, SEO libs present

## Entity inventory
| # | Entity | Data source | Pages (route pattern, count) | Candidate type(s) | Existing markup | Rich-result relevant? (provisional — Phase 2 confirms against the live gallery) | Proposed action |
...one row per (entity × page-type). Actions: add / fix / deepen / convert / skip — always with a reason.

## Existing markup findings
per emitter: location, type, classification, what's wrong

## Ambiguities for intake
numbered, each with a recommendation + consequence

## Definitions
(empty — Phase 2 fills this)

## Property maps & gap list
(empty — Phase 3 fills this)
```

The inventory must cover the whole site, including entities you'll recommend **skipping** — a skip row with a reason ("testimonials: real quotes but no verifiable reviews → marking them up as Review risks a manual action") is a deliverable, not noise.
